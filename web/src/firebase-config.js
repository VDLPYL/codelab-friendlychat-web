/**
 * To find your Firebase config object:
 * 
 * 1. Go to your [Project settings in the Firebase console](https://console.firebase.google.com/project/_/settings/general/)
 * 2. In the "Your apps" card, select the nickname of the app for which you need a config object.
 * 3. Select Config from the Firebase SDK snippet pane.
 * 4. Copy the config object snippet, then add it here.
 */


const config = {
  apiKey: "AIzaSyCMkvjYDTWEewpB8IltRqifFz9wAprYJ9c",
  authDomain: "vdlpyl-friendlychat.firebaseapp.com",
  projectId: "vdlpyl-friendlychat",
  storageBucket: "vdlpyl-friendlychat.firebasestorage.app",
  messagingSenderId: "327187947957",
  appId: "1:327187947957:web:a7285d9344690d264d39fc"
};

export function getFirebaseConfig() {
  if (!config || !config.apiKey) {
    throw new Error('No Firebase configuration object provided.' + '\n' +
    'Add your web app\'s configuration object to firebase-config.js');
  } else {
    return config;
  }
}