# Games NY-UK — Date Night Draw

A simple two-player real-time drawing game made for long-distance date nights.

One of you gets a secret prompt and draws it. The other watches the drawing appear live on a shared canvas. When the timer ends the prompt is revealed, then you swap roles.

## How to play
1. One person creates a room and shares the short code.
2. The other joins with the code.
3. Choose who draws first (or let it pick).
4. Drawer sees the prompt + timer and draws.
5. Watcher sees the canvas update live.
6. Timer ends → prompt revealed.
7. Swap and play again.

## Setup

### 1. Firebase Realtime Database
Make sure you have created a **Realtime Database** (not only Firestore) in your Firebase project.

1. Go to [Firebase Console](https://console.firebase.google.com/) → your project `date-night-eb68a`
2. Build → Realtime Database → Create Database (if you haven’t already)
3. Start in **test mode** for now
4. Copy the database URL that appears (it usually looks like `https://date-night-eb68a-default-rtdb.firebaseio.com` or with a region)

### 2. Update the config (if needed)
Open `app.js` and check the `firebaseConfig` object.  
If your Realtime Database URL is different, update the `databaseURL` line.

### 3. Security Rules (important)
In Firebase Console → Realtime Database → Rules, paste this for a private couple game (room codes act as the secret):

```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

(Later you can tighten this if you want.)

### 4. Run the game
- Just open `index.html` in a browser, **or**
- Enable GitHub Pages: Repo Settings → Pages → Source = Deploy from branch `main` / root
- Then visit `https://charlie-lipscomb.github.io/Games_NY-UK/`

Both of you can use phones or laptops.

## Tech
- Vanilla HTML + CSS + JavaScript
- Firebase Realtime Database for live sync
- No build step required

Made for NY ↔ Hertford date nights ❤️
