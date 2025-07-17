'use strict';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  setDoc,
  updateDoc,
  doc,
  serverTimestamp,
  getDocs,
  where
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from 'firebase/storage';
import {
  getMessaging,
  getToken,
  onMessage
} from 'firebase/messaging'; 
import { getPerformance } from 'firebase/performance';

import { getFirebaseConfig } from './firebase-config.js';

// Variables para limitar mensajes
let currentUserMessageCount = 0;
const MAX_MESSAGES_PER_USER = 10;

// Función para contar mensajes del usuario
async function countUserMessages() {
  if (!isUserSignedIn()) {
    currentUserMessageCount = 0;
    toggleButton();
    return;
  }
  const db = getFirestore();
  const userName = getUserName();
  const messagesRef = collection(db, 'messages');
  const q = query(messagesRef, where('name', '==', userName));
  const snapshot = await getDocs(q);
  currentUserMessageCount = snapshot.size;
  toggleButton();
}

// Iniciar sesión Friendly Chat
async function signIn() {
  var provider = new GoogleAuthProvider();
  await signInWithPopup(getAuth(), provider);
}

// Cerrar sesión
function signOutUser() {
  signOut(getAuth());
}

// Inicializar auth y observer
function initFirebaseAuth() {
  onAuthStateChanged(getAuth(), authStateObserver);
}

// Obtener URL foto perfil usuario
function getProfilePicUrl() {
  return getAuth().currentUser.photoURL || '/images/profile_placeholder.png';
}

// Obtener nombre usuario
function getUserName() {
  return getAuth().currentUser.displayName;
}

// Verifica si está logueado
function isUserSignedIn() {
  return !!getAuth().currentUser;
}

// Guardar mensaje texto
async function saveMessage(messageText) {
  try {
    await addDoc(collection(getFirestore(), 'messages'), {
      name: getUserName(),
      text: messageText,
      profilePicUrl: getProfilePicUrl(),
      timestamp: serverTimestamp()
    });
  } catch(error) {
    console.error('Error writing new message to Firebase Database', error);
  }
}

// Cargar mensajes + observer para el contador
function loadMessages() {
  const recentMessagesQuery = query(collection(getFirestore(), 'messages'), orderBy('timestamp', 'desc'), limit(12));
  onSnapshot(recentMessagesQuery, function(snapshot) {
    snapshot.docChanges().forEach(function(change) {
      if (change.type === 'removed') {
        deleteMessage(change.doc.id);
      } else {
        var message = change.doc.data();
        displayMessage(change.doc.id, message.timestamp, message.name,
                      message.text, message.profilePicUrl, message.imageUrl);
      }
    });
    // Recontar mensajes en cada cambio
    countUserMessages();
  });
}

// Guardar mensaje imagen
async function saveImageMessage(file) {
  try {
    const messageRef = await addDoc(collection(getFirestore(), 'messages'), {
      name: getUserName(),
      imageUrl: LOADING_IMAGE_URL,
      profilePicUrl: getProfilePicUrl(),
      timestamp: serverTimestamp()
    });
    const filePath = `${getAuth().currentUser.uid}/${messageRef.id}/${file.name}`;
    const newImageRef = ref(getStorage(), filePath);
    const fileSnapshot = await uploadBytesResumable(newImageRef, file);
    const publicImageUrl = await getDownloadURL(newImageRef);
    await updateDoc(messageRef, {
      imageUrl: publicImageUrl,
      storageUri: fileSnapshot.metadata.fullPath
    });
  } catch (error) {
    console.error('There was an error uploading a file to Cloud Storage:', error);
  }
}

// Guardar token de notificaciones (FCM)
async function saveMessagingDeviceToken() {
  try {
    const currentToken = await getToken(getMessaging());
    if (currentToken) {
      const tokenRef = doc(getFirestore(), 'fcmTokens', currentToken);
      await setDoc(tokenRef, { uid: getAuth().currentUser.uid });
      onMessage(getMessaging(), (message) => {
        console.log('New foreground notification from Firebase Messaging!', message.notification);
      });
    } else {
      requestNotificationsPermissions();
    }
  } catch(error) {
    console.error('Unable to get messaging token.', error);
  };
}

// Solicitar permisos notificación
async function requestNotificationsPermissions() {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await saveMessagingDeviceToken();
  }
}

// Handler imagen seleccionada
function onMediaFileSelected(event) {
  event.preventDefault();
  var file = event.target.files[0];
  imageFormElement.reset();
  if (!file.type.match('image.*')) {
    var data = {
      message: 'You can only share images',
      timeout: 2000
    };
    signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
    return;
  }
  if (checkSignedInWithMessage()) {
    saveImageMessage(file);
  }
}

// Enviar mensaje (limita a 10 mensajes por usuario)
function onMessageFormSubmit(e) {
  e.preventDefault();
  if (currentUserMessageCount >= MAX_MESSAGES_PER_USER) {
    var data = {
      message: 'Solo puedes enviar 10 mensajes',
      timeout: 2500
    };
    signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
    return;
  }
  if (messageInputElement.value && checkSignedInWithMessage()) {
    saveMessage(messageInputElement.value).then(async function() {
      resetMaterialTextfield(messageInputElement);
      // Recontar después de enviar
      await countUserMessages();
    });
  }
}

// Observer auth state (recontar mensajes al loguearse)
function authStateObserver(user) {
  if (user) {
    var profilePicUrl = getProfilePicUrl();
    var userName = getUserName();
    userPicElement.style.backgroundImage = 'url(' + addSizeToGoogleProfilePic(profilePicUrl) + ')';
    userNameElement.textContent = userName;
    userNameElement.removeAttribute('hidden');
    userPicElement.removeAttribute('hidden');
    signOutButtonElement.removeAttribute('hidden');
    signInButtonElement.setAttribute('hidden', 'true');
    saveMessagingDeviceToken();
    // ¡Aquí! -- Cuenta mensajes cuando el usuario inicia sesión
    countUserMessages();
  } else {
    userNameElement.setAttribute('hidden', 'true');
    userPicElement.setAttribute('hidden', 'true');
    signOutButtonElement.setAttribute('hidden', 'true');
    signInButtonElement.removeAttribute('hidden');
    currentUserMessageCount = 0;
    toggleButton();
  }
}

// Verifica usuario logueado (si no, muestra Toast)
function checkSignedInWithMessage() {
  if (isUserSignedIn()) {
    return true;
  }
  var data = {
    message: 'You must sign-in first',
    timeout: 2000
  };
  signInSnackbarElement.MaterialSnackbar.showSnackbar(data);
  return false;
}

// Reset campo de mensaje
function resetMaterialTextfield(element) {
  element.value = '';
  element.parentNode.MaterialTextfield.boundUpdateClassesHandler();
}

// Template mensaje (sin cambios)
var MESSAGE_TEMPLATE =
    '<div class="message-container">' +
      '<div class="spacing"><div class="pic"></div></div>' +
      '<div class="message"></div>' +
      '<div class="name"></div>' +
    '</div>';

// Google profile pic
function addSizeToGoogleProfilePic(url) {
  if (url.indexOf('googleusercontent.com') !== -1 && url.indexOf('?') === -1) {
    return url + '?sz=150';
  }
  return url;
}

var LOADING_IMAGE_URL = 'https://www.google.com/images/spin-32.gif?a';

// Eliminar mensaje del UI (sin cambios)
function deleteMessage(id) {
  var div = document.getElementById(id);
  if (div) {
    div.parentNode.removeChild(div);
  }
}

function createAndInsertMessage(id, timestamp) {
  const container = document.createElement('div');
  container.innerHTML = MESSAGE_TEMPLATE;
  const div = container.firstChild;
  div.setAttribute('id', id);
  timestamp = timestamp ? timestamp.toMillis() : Date.now();
  div.setAttribute('timestamp', timestamp);
  const existingMessages = messageListElement.children;
  if (existingMessages.length === 0) {
    messageListElement.appendChild(div);
  } else {
    let messageListNode = existingMessages[0];
    while (messageListNode) {
      const messageListNodeTime = messageListNode.getAttribute('timestamp');
      if (!messageListNodeTime) {
        throw new Error(
          `Child ${messageListNode.id} has no 'timestamp' attribute`
        );
      }
      if (messageListNodeTime > timestamp) {
        break;
      }
      messageListNode = messageListNode.nextSibling;
    }
    messageListElement.insertBefore(div, messageListNode);
  }
  return div;
}

// Mostrar mensaje en UI (sin cambios)
function displayMessage(id, timestamp, name, text, picUrl, imageUrl) {
  var div = document.getElementById(id) || createAndInsertMessage(id, timestamp);
  if (picUrl) {
    div.querySelector('.pic').style.backgroundImage = 'url(' + addSizeToGoogleProfilePic(picUrl) + ')';
  }
  div.querySelector('.name').textContent = name;
  var messageElement = div.querySelector('.message');
  if (text) {
    messageElement.textContent = text;
    messageElement.innerHTML = messageElement.innerHTML.replace(/\n/g, '<br>');
  } else if (imageUrl) {
    var image = document.createElement('img');
    image.addEventListener('load', function() {
      messageListElement.scrollTop = messageListElement.scrollHeight;
    });
    image.src = imageUrl + '&' + new Date().getTime();
    messageElement.innerHTML = '';
    messageElement.appendChild(image);
  }
  setTimeout(function() {div.classList.add('visible')}, 1);
  messageListElement.scrollTop = messageListElement.scrollHeight;
  messageInputElement.focus();
}

// Habilita/deshabilita el botón "Send"
function toggleButton() {
  if (messageInputElement.value && currentUserMessageCount < MAX_MESSAGES_PER_USER) {
    submitButtonElement.removeAttribute('disabled');
  } else {
    submitButtonElement.setAttribute('disabled', 'true');
  }
}

// Shortcuts a elementos DOM (igual que ya tienes)
var messageListElement = document.getElementById('messages');
var messageFormElement = document.getElementById('message-form');
var messageInputElement = document.getElementById('message');
var submitButtonElement = document.getElementById('submit');
var imageButtonElement = document.getElementById('submitImage');
var imageFormElement = document.getElementById('image-form');
var mediaCaptureElement = document.getElementById('mediaCapture');
var userPicElement = document.getElementById('user-pic');
var userNameElement = document.getElementById('user-name');
var signInButtonElement = document.getElementById('sign-in');
var signOutButtonElement = document.getElementById('sign-out');
var signInSnackbarElement = document.getElementById('must-signin-snackbar');
var charCounterElement = document.getElementById('char-counter'); // <--- Asegúrate que exista en tu HTML

// --- CONTADOR DE CARACTERES ---
function updateCharCounter() {
  if (!charCounterElement || !messageInputElement) return;
  const length = messageInputElement.value.length;
  charCounterElement.textContent = length + '/100';
  if (length === 100) {
    charCounterElement.style.color = 'red';
    charCounterElement.style.fontWeight = 'bold';
  } else {
    charCounterElement.style.color = '#888';
    charCounterElement.style.fontWeight = 'normal';
  }
}
updateCharCounter();
messageInputElement.addEventListener('input', updateCharCounter);

// Eventos
messageFormElement.addEventListener('submit', onMessageFormSubmit);
signOutButtonElement.addEventListener('click', signOutUser);
signInButtonElement.addEventListener('click', signIn);
messageInputElement.addEventListener('keyup', toggleButton);
messageInputElement.addEventListener('change', toggleButton);
imageButtonElement.addEventListener('click', function(e) {
  e.preventDefault();
  mediaCaptureElement.click();
});
mediaCaptureElement.addEventListener('change', onMediaFileSelected);

// Inicializa la app
const firebaseApp = initializeApp(getFirebaseConfig());
getPerformance();
initFirebaseAuth();
loadMessages();
