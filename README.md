# Namen lernen

Web-App zum Trainieren von Namen und Gesichtern auf dem iPhone.
Läuft über GitHub Pages: https://jowerhahn.github.io/Namen-lernen/
In Safari öffnen und über „Teilen → Zum Home-Bildschirm“ ablegen.

- `index.html`, `app.js`, `style.css`: die App (Kontakte, Fotos, Übungsrunde)
- `sprachtest.html`: Test der Safari-Spracherkennung
- Alle Daten (Kontakte, Fotos, Lernstand) bleiben im Browser auf dem Gerät (IndexedDB).

## Dateiformate

**Kontakte:** CSV-Export aus Outlook (Spalten Vorname/Nachname/Firma oder First Name/Last Name/Company).

**Fotopaket** (JSON):
```json
{ "type": "namen-lernen-fotopaket", "version": 1,
  "photos": [ { "first": "Anna", "last": "Müller", "company": "Acme",
                "image": "data:image/jpeg;base64,...", "source": "https://..." } ] }
```
Fotos werden per Name den Kontakten zugeordnet und müssen in der App bestätigt werden.
