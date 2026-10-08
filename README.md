# Stein für Stein

Eine lokale LEGO-Sammlung zur Verwaltung mehrerer Exemplare je Set, zum Erfassen von Fehlteilen und als gemeinsame Einkaufsliste. Die App cached Setdefinitionen und Inventare in PostgreSQL, damit bekannte Sets nicht bei jedem Aufruf erneut von Rebrickable geladen werden.

## Funktionen

- Responsive Sammlung mit Suche, Filtern, Sortierung und Vollständigkeitsanzeige.
- Rebrickable-Suche per Setnummer, Setbild und Inventarimport.
- Mehrere unabhängig verwaltete Exemplare derselben Setdefinition.
- Teileübersicht mit farbkorrekten Bildern aus den Set-/Farbpositionen, Sollmenge sowie `+`, `-` und `Gefunden`.
- Fehlteileliste über alle Exemplare, gruppiert nach Rebrickable-Part und Farbe; Fundbuchung je Exemplar.
- Diagnoseansicht, Datenbank-Healthcheck, Dark Mode entsprechend der Systemeinstellung.
- PostgreSQL-Persistenz, Compose- und Portainer-Deployment.

## Architektur

- **Next.js / TypeScript**: App Router und REST-Routen unter `src/app/api`.
- **LegoDataProvider**: Provider-Vertrag in `src/lib/lego-provider.ts`; `RebrickableProvider` kapselt Authentifizierung, Suche, Inventar und Theme-Abfrage. Weitere Anbieter können implementiert werden, ohne UI oder Inventarregeln zu ändern.
- **Prisma / PostgreSQL**: SetDefinition, SetInstance, InventoryItem, Part, Color, MissingPart und ImportMetadata sind getrennt modelliert.
- **Bilder**: Das farbspezifische Bild einer Set-/Farbposition liegt auf `InventoryItem.imageUrl`; `Part.imageUrl` dient als Fallback, wenn die Quelle kein Positionsbild liefert.
- **Inventory Normalization**: zentrale Funktion `normalizeInventory` in `src/lib/inventory-normalization.ts`; Tests liegen direkt daneben.
- **Client UI**: `src/components/collection-app.tsx`, wiederverwendbare Style-Tokens und responsive Komponenten in `src/app/globals.css`.

### Inventory Normalization

Die Anwendung speichert eine Soll-Liste für die physischen Teile eines gebauten Sets:

1. Ersatzteile werden ausgeschlossen. Rebrickable kennzeichnet sie mit `is_spare`; der Adapter behandelt außerdem `is_extra` als Ersatzteilkennzeichen.
2. Rebrickable führt Minifiguren zu einem Set separat. Der Adapter lädt die Set-Minifiguren und deren Parts-Inventare, multipliziert die Parts mit der Figurenanzahl und vereinigt gleiche Teil/Farb-Positionen mit dem Hauptinventar. So zählen die physischen Figurenbestandteile mit, ohne doppelte Tabellenpositionen zu erzeugen. Figuren ohne verfügbares Parts-Inventar bleiben unberücksichtigt.
3. Alternate Parts werden ausgeschlossen (`is_alternate` oder `alternate_of`). Sie werden nicht zur Menge des ausgewählten Originals addiert.
4. Rebrickable liefert über seinen Set-Teile-Endpunkt nicht in allen Datensätzen eine explizite Counterpart-Beziehung. Der Providervertrag erlaubt dafür `counterpart_group`, `counterpart_of` (Teilenummer der ersetzten Basisvariante) und `is_preferred_counterpart`. In einer solchen Gruppe wird genau eine Darstellung ausgewählt: explizit bevorzugte Counterparts zuerst, sonst Counterpart vor Basisteil. Mengen werden nie addiert.
5. Ohne eine explizite Beziehung werden Teile nicht aufgrund ähnlicher Nummern oder Bilder zusammengelegt. Das verhindert, dass eigenständige benötigte Teile versehentlich verschwinden.
6. Sticker-/Printvarianten werden bevorzugt, wenn die Quelle sie als bevorzugte Counterpart-Variante ausweist. Ohne Quelldaten kann die App eine reale Variante nicht zuverlässig erraten.
7. Beim Inventar-Refresh werden bestehende Fehlmengen nicht still gelöscht. Entfernte oder verkleinerte Sollpositionen mit offenen Fehlmengen bleiben als manuelle Position mit erhaltenem Fehlbestand gespeichert und in den Importmetadaten als Inventardifferenz ausgewiesen.

Diese Regeln priorisieren physische Vollständigkeit und vermeiden Scheingenauigkeit, wenn die Quelle keine Beziehung beschreibt.

## Voraussetzungen

- Docker Engine und Docker Compose v2 (oder Podman Compose).
- Rebrickable API-Key für Set-Suche und erstmalige Imports. API-Zugang und Limits unterliegen den Konditionen von Rebrickable.

## Installation mit Docker

1. Lege `.env` im Projektroot an:

   ```sh
   cp .env.example .env
   ```

2. Setze `REBRICKABLE_API_KEY` und ein individuelles `POSTGRES_PASSWORD`. `DATABASE_URL` muss bei Compose den Host `db` verwenden, zum Beispiel:

   ```dotenv
   DATABASE_URL=postgresql://lego:DEIN_PASSWORT@db:5432/lego?schema=public
   REBRICKABLE_API_KEY=dein-rebrickable-api-key
   POSTGRES_PASSWORD=DEIN_PASSWORT
   ```

3. Starte die Anwendung:

   ```sh
   docker compose up -d --build
   ```

4. Öffne [http://localhost:3000](http://localhost:3000). Der App-Container wartet auf den PostgreSQL-Healthcheck und gleicht beim Start das Prisma-Schema ab. Beide Container besitzen Healthchecks. Das Volume `postgres_data` enthält die Datenbank dauerhaft.

Das mitgelieferte `.env.example` enthält Platzhalter. Ersetze Passwort und API-Key vor dem Start; Compose verweigert den Start, solange `POSTGRES_PASSWORD` oder `DATABASE_URL` fehlen. `.env` wird von Git und Docker-Build-Kontext ausgeschlossen.

## Installation in Portainer

1. Öffne **Stacks → Add stack** und wähle das Git-Repository oder lade `docker-compose.yml` hoch.
2. Trage die Variablen `POSTGRES_PASSWORD`, `REBRICKABLE_API_KEY` und `DATABASE_URL` im Stack-Environment ein. `DATABASE_URL` muss auf `db:5432` zeigen.
3. Baue und deploye den Stack. Portainer verwaltet das benannte Volume `postgres_data`; sichere es regelmäßig.
4. Veröffentliche Port 3000 über den Reverse Proxy deiner Wahl und aktiviere dort TLS.

Für Updates den Stack mit dem neuen Quellstand erneut bauen. Das Datenbankschema wird beim App-Start additiv synchronisiert; vor einem Update wird ein Backup empfohlen.

## Konfiguration

| Variable | Zweck |
| --- | --- |
| `DATABASE_URL` | Prisma/PostgreSQL-Verbindung |
| `POSTGRES_PASSWORD` | PostgreSQL-Passwort im Compose-Stack |
| `REBRICKABLE_API_KEY` | Serverseitiger Key für Rebrickable API v3 |
| `BRICKOWL_API_KEY` | Server-Key für die BrickOwl Catalog API |
| `BRICKOWL_COUNTRY` | Regionale Zielländereinstellung, derzeit für Preisverläufe nicht benötigt |
| `NEXT_PUBLIC_APP_URL` | Öffentliche Basis-URL für spätere Links/Exporte |

Der API-Key wird ausschließlich serverseitig gelesen und nicht an Browsercode gesendet. Die API-Verbindung kann in **Diagnose** getestet werden. Ohne Key funktionieren lokale Seiten und bereits gespeicherte Daten; die externe Suche meldet die fehlende Konfiguration.

## Backup und Wiederherstellung

Die Diagnoseansicht bietet zusätzlich einen JSON-Export und einen Wiederherstellungsimport. Der Import führt anhand externer IDs und Setnummern zusammen und ist additiv: vorhandene Exemplare, Fehlmengen und Teile werden nicht überschrieben. Das JSON-Format ist versioniert (`lego-fehlteile-backup`, Version 1). Für eine vollständige PostgreSQL-Wiederherstellung bleibt ein SQL-Backup die richtige Wahl.

SQL-Backup innerhalb des Compose-Projekts:

```sh
docker compose exec -T db pg_dump -U lego lego > lego-backup.sql
```

Wiederherstellung in eine leere Datenbank:

```sh
cat lego-backup.sql | docker compose exec -T db psql -U lego -d lego
```

Das Volume ist persistent, ersetzt aber kein separates Backup.

## Entwicklung

1. PostgreSQL bereitstellen (Compose oder eine lokale Instanz) und `DATABASE_URL` in `.env` setzen.
2. Abhängigkeiten installieren und Prisma Client erzeugen:

   ```sh
   npm install
   npx prisma generate
   npx prisma db push
   npm run dev
   ```

3. Die Normalisierungstests laufen ohne externe Dienste. Für die Datenbank-Integrationstests `TEST_DATABASE_URL` auf eine separate, leere Testdatenbank setzen; diese Tests legen eigene `TEST-E2E-*`-Datensätze an und entfernen sie anschließend wieder. Tests und Produktionsbuild:

   ```sh
   npm test
   npm run build
   ```

   Beispiel mit einer lokalen PostgreSQL-Testdatenbank:

   ```sh
   TEST_DATABASE_URL='postgresql://lego:lego-local-password@127.0.0.1:5432/lego?schema=public' npm test
   ```

`npm run doctor` führt den React-Doctor-Scan aus. React Grab und React Scan sind nur in Development eingebunden.

## Datenintegrität und Betrieb

### BrickOwl-Preisermittlung

Hinterlege `BRICKOWL_API_KEY` in `.env`. Es ist kein Händler-Shop erforderlich, aber BrickOwl verlangt ein Konto zum Erstellen eines API-Keys. Laut offizieller Dokumentation brauchen Preisendpunkte zusätzlich die Freigabe „Catalog Approval“. Der Key bleibt serverseitig. Die Marktwerte-Seite ermittelt BOIDs aus LEGO Setnummern beziehungsweise LEGO Element IDs, cached Preisverläufe 24 Stunden und zeigt BrickOwls GBP-Werte. Solange die Freigabe fehlt, kann jeder Set- und Teilepreis auf derselben Seite von Hand eingetragen werden. Diese manuellen Preise bleiben gespeichert und werden auch nach 24 Stunden und bei einem erneuten Abruf nicht durch BrickOwl ersetzt. Entfernst du einen manuellen Preis, gilt danach wieder der API-Cache. Der Preisverlauf ist ein Marktindikator und keine individuelle Setbewertung.

BrickOwl dokumentiert den API-Key, die tägliche Quote und die Katalog- sowie Preisendpunkte in der [offiziellen API-Referenz](https://www.brickowl.com/api_docs). BrickOwl verlangt, angezeigte Katalog- und Preisdaten der Quelle zuzuschreiben.

### Fotos, Bestellungen und Sammlungspflege

Pro Set-Exemplar können bis zu 20 JPG-, PNG- oder WebP-Fotos mit jeweils 6 MB gespeichert werden. Bestellungen erfassen Händler, Bestellnummer, Versand, Währung, Teilemenge und Einzelpreis. Beim Verbuchen einer Lieferung werden erhaltene Bestellpositionen fortgeschrieben; Teilmengen bleiben als Teillieferung sichtbar. Der eigene Einstandspreis und der aktuelle BrickOwl-Marktwert sind getrennte Angaben. Verkaufs- und QR-Lageretiketten lassen sich über den Browser drucken. Der QR-Code öffnet das zugehörige Exemplar direkt.

Die PWA stellt App-Shell und Navigation nach einem vorherigen Online-Aufruf offline bereit; API-Änderungen benötigen weiterhin eine Verbindung. Der zuletzt verwendete Setfilter, die Sortierung und Suche werden lokal gespeichert. Änderungen der Inventur lassen sich direkt nach dem Speichern rückgängig machen. Fehlerzustand, falsche Farbe und Notizen werden am geprüften Inventarteil abgelegt. Setfotos liegen in der PostgreSQL-Datenbank und sind im JSON-Backup enthalten.

### Automatische Datenbank-Backups

Compose startet einen Backup-Dienst. Er erstellt täglich PostgreSQL-Dumps im persistenten Volume `postgres_backups`. Die Aufbewahrung steuerst du mit `BACKUP_KEEP_DAYS` (14), `BACKUP_KEEP_WEEKS` (8) und `BACKUP_KEEP_MONTHS` (6). Backups können beispielsweise so auf den Host kopiert werden:

```sh
docker compose exec -T backup sh -lc 'ls -lah /backups'
docker compose cp backup:/backups ./lego-postgres-backups
```

Bewahre zusätzlich eine Kopie außerhalb des Docker-Hosts auf. Nach Änderungen an `.env` oder Compose-Konfiguration den Stack mit `docker compose up -d` aktualisieren.

- Ein erstmaliger Import wird erst nach erfolgreicher Quellabfrage in einer Datenbanktransaktion gespeichert. Ein Fehler lässt keine halbe Setdefinition zurück.
- Bekannte Setnummern verwenden die lokale Definition; neue Exemplare laden das Inventar nicht erneut.
- Ein Update ergänzt, ändert oder entfernt normalisierte Inventarpositionen transaktional und protokolliert Importzeitpunkt, Provider und Mengenvergleich.
- `+` und `-` werden serverseitig gegen 0 und die Sollmenge validiert.
- Inventarpositionen besitzen pro Exemplar einen eigenen Prüfstatus. Ungeprüfte Positionen gelten nicht als vorhanden; vorhandene Legacy-Fehlmengen werden als geprüft interpretiert.
- Globale Fehlteile erlauben Teilfundbuchungen. Einkaufseinträge unterscheiden vorgemerkte und bestellte Mengen und werden beim Verbuchen gefundener Teile auf die Restfehlmenge begrenzt.
- Bestellte Teile können anteilig als eingetroffen verbucht werden. Die bestätigte Menge wird als erhalten protokolliert und reduziert die Fehlmenge desselben Exemplars in einer Transaktion.
- CSV- und BrickLink-Wanted-List-XML-Exporte stehen in der Einkaufsliste bereit. Für XML sind BrickLink-IDs für Teil und Farbe erforderlich; die CSV enthält die verfügbaren Quell-IDs.
- Die Marktwerte-Seite nutzt BrickOwls Price-History-API und cached Ergebnisse 24 Stunden. Sie löst Setnummern und LEGO Element IDs in BrickOwl-Katalog-IDs auf. Die API liefert zusammengefasste Preisverläufe in GBP; seltene Teile können ohne ausreichende Daten sein. Für Preisendpunkte verlangt BrickOwl Catalog Approval. Manuelle Preise sind pro Set-Exemplar beziehungsweise pro Teil und Farbe gespeichert, nehmen nicht am 24-Stunden-Refresh teil und bleiben auch bei einem späteren API-Abruf stehen, bis sie entfernt werden.
- Loser Teilebestand wird separat nach Teil und Farbe geführt. Die Teilebestandsansicht verrechnet ihn rechnerisch mit den Fehlteilen und zeigt Abdeckung, Überschuss und verbleibenden Einkauf.
- Lagerorte können Exemplaren und losem Bestand zugeordnet werden. Zustand, Anleitung samt Zustand, Originalkarton samt Zustand und Notizen werden pro Set-Exemplar gespeichert.
- Inventursitzungen speichern aktuelle Position, Gruppierung und Filter pro Exemplar. Tastatursteuerung (Pfeiltasten, `+`, `-`, Enter) und Wischgeste auf dem Bildbereich unterstützen die Inventur.
- Diagnose zeigt die lokal fehlenden Teilekategorien, Teilebilder und BrickLink-Zuordnungen, damit unvollständige Metadaten sichtbar bleiben.
- Die Inventur lässt sich nach Farbe, Teilenummer oder Teilekategorie gruppieren und auf ungeprüfte Positionen einschränken. Teilekategorien werden aus Rebrickable lokal gecacht.
- Vor einem Inventarupdate zeigt eine Vorschau hinzugefügte, entfernte und mengenveränderte Positionen. Erst nach Bestätigung wird die Änderung gespeichert; vorhandene Fehlmengen bleiben erhalten.
- Externe API-Aufrufe nutzen Authentifizierung, Retry/Backoff und verständliche Fehlermeldungen für Rate-Limits und Authentifizierungsfehler.
- Fehlteilgruppen und Bestandssummen basieren auf Part und Farbe. BrickOwl-Export sowie Händler- und Preisabgleich bleiben mögliche Erweiterungen.

## Bekannte Quellgrenzen

Rebrickable-Setinventare enthalten nicht durchgehend ein Feld für stickerbedingte Counterparts oder die physisch verwendete Variante. Die App wendet die Counterpart-Regel nur an, wenn eine Quelle die Beziehung explizit liefert. Sie zählt keine vermeintlichen Dubletten anhand ähnlicher Teilenummern zusammen. Für belastbare sticker-/druckspezifische Sollmengen ist eine Quelle mit gepflegter Counterpart-Beziehung nötig.
