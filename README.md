# Union

Keep track of and build trust with people, join groups, and spend locally.  Find the others!   

## Contact Manager

- **Lightning-fast exchanges:** Add a new contact and share your info in seconds, even if they don't have the app.
- **Privacy controls:** You choose exactly which personal info to share. Changes update everywhere automatically.
- **Relationship tracking:** Save selfies when you meet, keep notes, and see how your network evolves over time.
- **Mutual connections:** Instantly discover shared mutuals and shared trust. 
- **Trust and endorsements:** Privately vouch for people, building a web-of-trust that helps you meet new people safely.



## Security 

NOTE: THIS SECURITY DESIGN IS NOT YET IMPLEMENTED, SO IF YOU ARE USING UNION YOU ARE PROBABLY A FRIEND OF PHILIP AND ARE WILLING TO TEST IN THE OPEN. DON'T SHARE PRIVATE STUFF YET!

- Union will use E2EE and Message Relays to create a distributed system where no information is stored in a central database or accessible to the Union operators.  


## Repository layout

| Path | Purpose |
|------|---------|
| `index.html`, `js/`, `styles.css`, … | Static web app (GitHub Pages) |
| `sql/` | Supabase schema and migration SQL (main file: `sql/fairshare-schema.sql`) |
| `docs/` | Architecture and feature notes (Markdown) |
| `supabase/functions/send-push/` | Edge function source (deploy with Supabase CLI, not Pages) |
