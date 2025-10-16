/**
 * Cryptography utilities for end-to-end encryption
 * Uses Web Crypto API for RSA-OAEP and AES-GCM
 */

// Convert ArrayBuffer to Base64 string
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 string to ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate RSA key pair (4096-bit) for asymmetric encryption
 */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 4096,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export RSA public key to PEM format string
 */
export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('spki', key);
  const exportedAsBase64 = arrayBufferToBase64(exported);
  return `-----BEGIN PUBLIC KEY-----\n${exportedAsBase64}\n-----END PUBLIC KEY-----`;
}

/**
 * Import RSA public key from PEM format string
 */
export async function importPublicKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');
  const binaryKey = base64ToArrayBuffer(pemContents);
  
  return await window.crypto.subtle.importKey(
    'spki',
    binaryKey,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['encrypt']
  );
}

/**
 * Export RSA private key to store in IndexedDB
 */
export async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const exported = await window.crypto.subtle.exportKey('pkcs8', key);
  return arrayBufferToBase64(exported);
}

/**
 * Import RSA private key from storage
 */
export async function importPrivateKey(keyData: string): Promise<CryptoKey> {
  const binaryKey = base64ToArrayBuffer(keyData);
  
  return await window.crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256',
    },
    true,
    ['decrypt']
  );
}

/**
 * Encrypt message using hybrid encryption (AES-GCM + RSA-OAEP)
 * @param message - Plain text message to encrypt
 * @param recipientPublicKey - Recipient's RSA public key
 * @returns Object containing ciphertext, IV, and encrypted AES key
 */
export async function encryptMessage(
  message: string,
  recipientPublicKey: CryptoKey
): Promise<{
  ciphertext: string;
  iv: string;
  encryptedKey: string;
}> {
  // Generate random AES-GCM key
  const aesKey = await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );

  // Generate random IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // Encrypt message with AES-GCM
  const encodedMessage = new TextEncoder().encode(message);
  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    aesKey,
    encodedMessage
  );

  // Export AES key
  const exportedAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

  // Encrypt AES key with recipient's RSA public key
  const encryptedAesKey = await window.crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    recipientPublicKey,
    exportedAesKey
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv.buffer),
    encryptedKey: arrayBufferToBase64(encryptedAesKey),
  };
}

/**
 * Decrypt message using hybrid encryption
 * @param ciphertext - Base64 encoded encrypted message
 * @param iv - Base64 encoded initialization vector
 * @param encryptedKey - Base64 encoded encrypted AES key
 * @param privateKey - User's RSA private key
 * @returns Decrypted plain text message
 */
export async function decryptMessage(
  ciphertext: string,
  iv: string,
  encryptedKey: string,
  privateKey: CryptoKey
): Promise<string> {
  // Decrypt AES key with RSA private key
  const encryptedAesKeyBuffer = base64ToArrayBuffer(encryptedKey);
  const aesKeyBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'RSA-OAEP',
    },
    privateKey,
    encryptedAesKeyBuffer
  );

  // Import AES key
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesKeyBuffer,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['decrypt']
  );

  // Decrypt message with AES-GCM
  const ivBuffer = base64ToArrayBuffer(iv);
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
  
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: ivBuffer,
    },
    aesKey,
    ciphertextBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Store private key in IndexedDB
 */
export async function storePrivateKey(userId: string, privateKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EncryptDB', 1);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['keys'], 'readwrite');
      const store = transaction.objectStore('keys');
      store.put({ userId, privateKey });
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'userId' });
      }
    };
  });
}

/**
 * Retrieve private key from IndexedDB
 */
export async function retrievePrivateKey(userId: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('EncryptDB', 1);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['keys'], 'readonly');
      const store = transaction.objectStore('keys');
      const getRequest = store.get(userId);

      getRequest.onsuccess = () => {
        const result = getRequest.result;
        resolve(result ? result.privateKey : null);
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'userId' });
      }
    };
  });
}
