// frontend/src/services/crypto.service.ts
// Implementação usando apenas Web Crypto API nativa do browser

/**
 * Serviço de criptografia end-to-end
 * Usa APENAS APIs nativas do browser (Web Crypto API)
 * - ECDH com curva P-256 para troca de chaves Diffie-Hellman
 * - AES-256-GCM para cifrar mensagens
 * - HKDF-SHA256 para derivação de chaves
 */
export class CryptoService {
  // ============= GERAÇÃO DE CHAVES ECDH (P-256) =============

  /**
   * Gera par de chaves ECDH (Elliptic Curve Diffie-Hellman)
   * Usa curva P-256 (suportada nativamente no browser)
   */
  static async generateKeyPair(): Promise<{
    privateKey: CryptoKey;
    publicKey: CryptoKey;
    publicKeyRaw: ArrayBuffer;
  }> {
    try {
      console.log("[CRYPTO] Gerando par de chaves ECDH (P-256)...");

      // Gerar par de chaves ECDH
      const keyPair = await crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256", // Curva elíptica P-256 (secp256r1)
        },
        true, // Extraível
        ["deriveKey", "deriveBits"]
      );

      console.log("[CRYPTO] Par de chaves ECDH gerado com sucesso");

      // Exportar chave pública para formato raw (para enviar ao servidor)
      const publicKeyRaw = await crypto.subtle.exportKey(
        "raw",
        keyPair.publicKey
      );

      console.log(
        "  Chave pública (primeiros 16 bytes):",
        Array.from(new Uint8Array(publicKeyRaw).slice(0, 16))
      );
      console.log(
        "  Tamanho da chave pública:",
        publicKeyRaw.byteLength,
        "bytes"
      );

      return {
        privateKey: keyPair.privateKey,
        publicKey: keyPair.publicKey,
        publicKeyRaw: publicKeyRaw,
      };
    } catch (error) {
      console.error("[CRYPTO] Erro ao gerar par de chaves:", error);
      throw error;
    }
  }

  /**
   * Importa chave pública de raw bytes
   */
  static async importPublicKey(publicKeyRaw: ArrayBuffer): Promise<CryptoKey> {
    try {
      console.log("[CRYPTO] Importando chave pública...");
      console.log("  Tamanho:", publicKeyRaw.byteLength, "bytes");

      const publicKey = await crypto.subtle.importKey(
        "raw",
        publicKeyRaw,
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        []
      );

      console.log("[CRYPTO] Chave pública importada com sucesso");

      return publicKey;
    } catch (error) {
      console.error("[CRYPTO] Erro ao importar chave pública:", error);
      throw error;
    }
  }

  // ============= CONVERSÃO BASE64 =============

  /**
   * Converte ArrayBuffer para Base64
   */
  static arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    try {
      const bytes =
        buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;

      if (!bytes || bytes.length === 0) {
        throw new Error("Buffer vazio");
      }

      // Método mais seguro usando reduce
      const binary = Array.from(bytes)
        .map((byte) => String.fromCharCode(byte))
        .join("");

      const base64 = btoa(binary);

      console.log("[CRYPTO] Conversão para Base64 concluída");
      console.log(
        "  Tamanho:",
        bytes.length,
        "bytes →",
        base64.length,
        "chars"
      );

      return base64;
    } catch (error) {
      console.error("[CRYPTO] Erro ao converter para Base64:", error);
      throw error;
    }
  }

  /**
   * Converte Base64 para ArrayBuffer
   */
  static base64ToArrayBuffer(base64: string): ArrayBuffer {
    try {
      if (!base64 || typeof base64 !== "string") {
        throw new Error("Base64 inválido");
      }

      /* // Validar formato Base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(base64.trim())) {
        throw new Error("String contém caracteres inválidos");
      } */

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      console.log("[CRYPTO] Conversão de Base64 concluída");
      console.log("  Tamanho:", bytes.length, "bytes");

      return bytes.buffer;
    } catch (error) {
      console.error("[CRYPTO] Erro ao converter Base64:", error);
      console.error(
        "  String recebida (primeiros 50 chars):",
        base64?.substring(0, 50)
      );
      throw error;
    }
  }

  // ============= DIFFIE-HELLMAN (ECDH) =============

  /**
   * Calcula segredo compartilhado usando ECDH
   */
  static async computeSharedSecret(
    myPrivateKey: CryptoKey,
    theirPublicKey: CryptoKey
  ): Promise<ArrayBuffer> {
    try {
      console.log(" [CRYPTO] Computando segredo compartilhado (ECDH)...");

      // Derivar bits do segredo compartilhado
      const sharedSecret = await crypto.subtle.deriveBits(
        {
          name: "ECDH",
          public: theirPublicKey,
        },
        myPrivateKey,
        256 // 256 bits
      );

      console.log("[CRYPTO] Segredo compartilhado calculado");
      console.log("  Tamanho:", sharedSecret.byteLength, "bytes");
      console.log(
        "  Primeiros 8 bytes:",
        Array.from(new Uint8Array(sharedSecret).slice(0, 8))
      );

      return sharedSecret;
    } catch (error) {
      console.error("[CRYPTO] Erro ao computar segredo compartilhado:", error);
      throw error;
    }
  }

  // ============= DERIVAÇÃO DE CHAVE AES =============

  /**
   * Deriva chave AES-256 do segredo compartilhado usando HKDF
   */
  static async deriveAESKey(sharedSecret: ArrayBuffer): Promise<CryptoKey> {
    try {
      console.log(
        "[CRYPTO] Derivando chave AES-256 do segredo compartilhado..."
      );

      // Importar segredo compartilhado
      const baseKey = await crypto.subtle.importKey(
        "raw",
        sharedSecret,
        "HKDF",
        false,
        ["deriveKey"]
      );

      // Derivar chave AES-GCM
      const aesKey = await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(32), // Salt vazio (pode melhorar com salt aleatório)
          info: new TextEncoder().encode("chat-encryption-v1"),
        },
        baseKey,
        {
          name: "AES-GCM",
          length: 256,
        },
        false,
        ["encrypt", "decrypt"]
      );

      console.log("[CRYPTO] Chave AES-256-GCM derivada com sucesso");

      return aesKey;
    } catch (error) {
      console.error("[CRYPTO] Erro ao derivar chave AES:", error);
      throw error;
    }
  }

  // ============= CRIPTOGRAFIA AES-GCM =============

  /**
   * Cifra mensagem com AES-256-GCM
   */
  static async encryptMessage(
    message: string,
    aesKey: CryptoKey
  ): Promise<{ encryptedData: string; nonce: string }> {
    try {
      console.log("[CRYPTO] Cifrando mensagem com AES-256-GCM...");
      console.log("  Mensagem (primeiros 50 chars):", message.substring(0, 50));

      // Gerar nonce (IV) aleatório
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      console.log("  Nonce gerado (12 bytes):", Array.from(nonce));

      // Codificar mensagem
      const encodedMessage = new TextEncoder().encode(message);

      // Cifrar com AES-GCM
      const encryptedBuffer = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce,
        },
        aesKey,
        encodedMessage
      );

      const encryptedData = this.arrayBufferToBase64(encryptedBuffer);
      const nonceB64 = this.arrayBufferToBase64(nonce);

      console.log("[CRYPTO] Mensagem cifrada com sucesso");
      console.log(
        "  Dados cifrados (primeiros 50 chars):",
        encryptedData.substring(0, 50)
      );
      console.log(
        "  Tamanho:",
        encodedMessage.length,
        "bytes →",
        encryptedData.length,
        "chars"
      );

      return {
        encryptedData,
        nonce: nonceB64,
      };
    } catch (error) {
      console.error("[CRYPTO] Erro ao cifrar mensagem:", error);
      throw error;
    }
  }

  /**
   * Decifra mensagem com AES-256-GCM
   */
  static async decryptMessage(
    encryptedData: string,
    nonce: string,
    aesKey: CryptoKey
  ): Promise<string> {
    try {
      console.log(" [CRYPTO] Decifrando mensagem com AES-256-GCM...");

      const encryptedBuffer = this.base64ToArrayBuffer(encryptedData);
      const nonceBuffer = this.base64ToArrayBuffer(nonce);

      console.log(
        "  Nonce (12 bytes):",
        Array.from(new Uint8Array(nonceBuffer))
      );

      // Decifrar com AES-GCM
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonceBuffer,
        },
        aesKey,
        encryptedBuffer
      );

      const decryptedMessage = new TextDecoder().decode(decryptedBuffer);

      console.log("[CRYPTO] Mensagem decifrada com sucesso");
      console.log(
        "  Mensagem (primeiros 50 chars):",
        decryptedMessage.substring(0, 50)
      );

      return decryptedMessage;
    } catch (error) {
      console.error("[CRYPTO] Erro ao decifrar mensagem:", error);
      throw new Error(
        "Falha na descriptografia - chave incorreta ou dados corrompidos"
      );
    }
  }

  // frontend/src/services/crypto.service.ts

  // 🔧 SUBSTITUIR estas 3 funções:

  /**
   * Deriva chave AES da senha do usuário usando PBKDF2
   */
  static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    try {
      console.log(" [CRYPTO] Derivando chave da senha...");

      // Codificar senha
      const passwordBytes = new TextEncoder().encode(password);

      // Importar senha como chave base
      const baseKey = await crypto.subtle.importKey(
        "raw",
        passwordBytes,
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"]
      );

      // Garantir que salt seja Uint8Array
      const saltBytes = new Uint8Array(salt);

      // Derivar chave AES usando PBKDF2
      const derivedKey = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: saltBytes,
          iterations: 100000, // 100k iterações
          hash: "SHA-256",
        },
        baseKey,
        {
          name: "AES-GCM",
          length: 256,
        },
        false, // Não extraível
        ["encrypt", "decrypt"] // CORRIGIDO: usar encrypt/decrypt
      );

      console.log("[CRYPTO] Chave derivada da senha");

      return derivedKey;
    } catch (error) {
      console.error("[CRYPTO] Erro ao derivar chave da senha:", error);
      throw error;
    }
  }

  /**
   * Cifra chave privada com senha do usuário
   */
  static async encryptPrivateKey(
    privateKey: CryptoKey,
    password: string
  ): Promise<{ encryptedPrivateKey: string; salt: string; iv: string }> {
    try {
      console.log("[CRYPTO] Cifrando chave privada com senha...");

      // 1. Gerar salt aleatório
      const salt = crypto.getRandomValues(new Uint8Array(16));
      console.log("  Salt gerado:", Array.from(salt.slice(0, 8)));

      // 2. Derivar chave de cifra da senha
      const derivedKey = await this.deriveKeyFromPassword(password, salt);

      // 3. Gerar IV
      const iv = crypto.getRandomValues(new Uint8Array(12));
      console.log("  IV gerado:", Array.from(iv));

      // 4. Exportar chave privada como JWK
      console.log("  Exportando chave privada como JWK...");
      const privateKeyJWK = await crypto.subtle.exportKey("jwk", privateKey);
      console.log("  JWK exportado:", Object.keys(privateKeyJWK));

      // 5. Converter JWK para string e depois para bytes
      const privateKeyString = JSON.stringify(privateKeyJWK);
      const privateKeyBytes = new TextEncoder().encode(privateKeyString);
      console.log(
        "  Tamanho da chave privada:",
        privateKeyBytes.length,
        "bytes"
      );

      // 6. Cifrar os bytes da chave privada
      console.log("  Cifrando com AES-256-GCM...");
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        derivedKey,
        privateKeyBytes
      );

      console.log("[CRYPTO] Chave privada cifrada com sucesso");
      console.log("  Tamanho cifrado:", encryptedData.byteLength, "bytes");

      return {
        encryptedPrivateKey: this.arrayBufferToBase64(encryptedData),
        salt: this.arrayBufferToBase64(salt),
        iv: this.arrayBufferToBase64(iv),
      };
    } catch (error: any) {
      console.error("[CRYPTO] Erro ao cifrar chave privada:", error);
      console.error("  Detalhes:", error.message);
      throw error;
    }
  }

  /**
   * Decifra chave privada com senha do usuário
   */
  static async decryptPrivateKey(
    encryptedPrivateKey: string,
    salt: string,
    iv: string,
    password: string
  ): Promise<CryptoKey> {
    try {
      console.log(" [CRYPTO] Decifrando chave privada com senha...");

      // 1. Converter de Base64
      const encryptedData = this.base64ToArrayBuffer(encryptedPrivateKey);
      const saltBytes = new Uint8Array(this.base64ToArrayBuffer(salt));
      const ivBytes = new Uint8Array(this.base64ToArrayBuffer(iv));

      console.log("  Tamanho cifrado:", encryptedData.byteLength, "bytes");
      console.log("  Salt:", Array.from(saltBytes.slice(0, 8)));
      console.log("  IV:", Array.from(ivBytes));

      // 2. Derivar chave de cifra da senha
      const derivedKey = await this.deriveKeyFromPassword(password, saltBytes);

      // 3. Decifrar
      console.log("  Decifrando com AES-256-GCM...");
      const decryptedData = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBytes,
        },
        derivedKey,
        encryptedData
      );

      // 4. Converter de volta para JWK
      const privateKeyString = new TextDecoder().decode(decryptedData);
      console.log(
        "  String decifrada, tamanho:",
        privateKeyString.length,
        "chars"
      );

      const privateKeyJWK = JSON.parse(privateKeyString);
      console.log("  JWK recuperado:", Object.keys(privateKeyJWK));

      // 5. Importar chave privada
      console.log("  Importando chave privada...");
      const privateKey = await crypto.subtle.importKey(
        "jwk",
        privateKeyJWK,
        {
          name: "ECDH",
          namedCurve: "P-256",
        },
        true,
        ["deriveKey", "deriveBits"]
      );

      console.log("[CRYPTO] Chave privada decifrada com sucesso");

      return privateKey;
    } catch (error: any) {
      console.error("[CRYPTO] Erro ao decifrar chave privada:", error);
      console.error("  Detalhes:", error.message);

      if (error.name === "OperationError") {
        throw new Error("Senha incorreta");
      }

      throw new Error("Falha ao decifrar chave privada: " + error.message);
    }
  }

  // ADICIONAR estas funções ao final da classe CryptoService:

  // ============= FUNÇÕES UTILITÁRIAS =============

  /**
   * Gera hash SHA-256 de uma chave para comparação visual (não para segurança)
   * Retorna primeiros 16 caracteres do hash em hex
   */
  static async getKeyFingerprint(key: CryptoKey | ArrayBuffer): Promise<string> {
    try {
      let keyBytes: ArrayBuffer;

      if (key instanceof CryptoKey) {
        // Exportar chave para raw bytes
        keyBytes = await crypto.subtle.exportKey("raw", key);
      } else {
        keyBytes = key;
      }

      // Gerar hash SHA-256
      const hashBuffer = await crypto.subtle.digest("SHA-256", keyBytes);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Retornar primeiros 16 caracteres
      return hashHex.substring(0, 16);
    } catch (error) {
      console.error("[CRYPTO] Erro ao gerar fingerprint:", error);
      return "error";
    }
  }

  // ============= FUNÇÕES DE GRUPO =============

  /**
   * Gera chave simétrica AES-256 para o grupo
   */
  static async generateGroupKey(): Promise<CryptoKey> {
    try {
      console.log("[CRYPTO-GROUP] Gerando chave AES-256 para grupo...");

      const key = await crypto.subtle.generateKey(
        {
          name: "AES-GCM",
          length: 256,
        },
        true, // Extraível
        ["encrypt", "decrypt"]
      );

      console.log("[CRYPTO-GROUP] Chave do grupo gerada");

      return key;
    } catch (error) {
      console.error("[CRYPTO-GROUP] Erro ao gerar chave do grupo:", error);
      throw error;
    }
  }

  /**
   * Exporta chave do grupo como raw bytes
   */
  static async exportGroupKey(key: CryptoKey): Promise<ArrayBuffer> {
    try {
      const exported = await crypto.subtle.exportKey("raw", key);
      console.log(
        "[CRYPTO-GROUP] Chave do grupo exportada:",
        exported.byteLength,
        "bytes"
      );
      return exported;
    } catch (error) {
      console.error("[CRYPTO-GROUP] Erro ao exportar chave do grupo:", error);
      throw error;
    }
  }

  /**
   * Importa chave do grupo de raw bytes
   */
  static async importGroupKey(keyBytes: ArrayBuffer): Promise<CryptoKey> {
    try {
      console.log("[CRYPTO-GROUP] Importando chave do grupo...");

      const key = await crypto.subtle.importKey(
        "raw",
        keyBytes,
        {
          name: "AES-GCM",
          length: 256,
        },
        true,
        ["encrypt", "decrypt"]
      );

      console.log("[CRYPTO-GROUP] Chave do grupo importada");

      return key;
    } catch (error) {
      console.error("[CRYPTO-GROUP] Erro ao importar chave do grupo:", error);
      throw error;
    }
  }

  /**
   * Cifra chave do grupo para um membro específico
   */
  static async encryptGroupKeyForMember(
    groupKey: ArrayBuffer,
    memberPublicKeyRaw: ArrayBuffer
  ): Promise<{ encryptedGroupKey: string; ephemeralPublicKey: string }> {
    try {
      console.log("[CRYPTO-GROUP] Cifrando chave do grupo para membro...");

      // 1. Gerar par efêmero
      const ephemeralKeys = await this.generateKeyPair();

      // 2. Importar chave pública do membro
      const memberPublicKey = await this.importPublicKey(memberPublicKeyRaw);

      // 3. Computar segredo compartilhado
      const sharedSecret = await this.computeSharedSecret(
        ephemeralKeys.privateKey,
        memberPublicKey
      );

      // 4. Derivar chave AES de wrapping
      const wrapKey = await this.deriveAESKey(sharedSecret);

      // 5. Converter groupKey para Base64 e depois para bytes
      const groupKeyB64 = this.arrayBufferToBase64(groupKey);
      const groupKeyBytes = new TextEncoder().encode(groupKeyB64);

      // 6. Cifrar a chave do grupo
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: nonce,
        },
        wrapKey,
        groupKeyBytes
      );

      // 7. Combinar encryptedData e nonce
      const combined =
        this.arrayBufferToBase64(encryptedData) +
        ":" +
        this.arrayBufferToBase64(nonce);

      console.log("[CRYPTO-GROUP] Chave do grupo cifrada para membro");

      return {
        encryptedGroupKey: combined,
        ephemeralPublicKey: this.arrayBufferToBase64(
          ephemeralKeys.publicKeyRaw
        ),
      };
    } catch (error) {
      console.error("[CRYPTO-GROUP] Erro ao cifrar chave do grupo:", error);
      throw error;
    }
  }

  /**
   * Decifra chave do grupo
   */
  static async decryptGroupKey(
    encryptedGroupKey: string,
    ephemeralPublicKeyB64: string,
    myPrivateKey: CryptoKey
  ): Promise<ArrayBuffer> {
    try {
      console.log(" [CRYPTO-GROUP] Decifrando chave do grupo...");

      // 1. Separar dados cifrados e nonce
      const [encryptedData, nonce] = encryptedGroupKey.split(":");

      if (!encryptedData || !nonce) {
        throw new Error("Formato de chave cifrada inválido");
      }

      // 2. Importar chave pública efêmera
      const ephemeralPublicKeyRaw = this.base64ToArrayBuffer(
        ephemeralPublicKeyB64
      );
      const ephemeralPublicKey = await this.importPublicKey(
        ephemeralPublicKeyRaw
      );

      // 3. Computar segredo compartilhado
      const sharedSecret = await this.computeSharedSecret(
        myPrivateKey,
        ephemeralPublicKey
      );

      // 4. Derivar chave AES
      const wrapKey = await this.deriveAESKey(sharedSecret);

      // 5. Decifrar
      const encryptedBuffer = this.base64ToArrayBuffer(encryptedData);
      const nonceBuffer = this.base64ToArrayBuffer(nonce);

      const decryptedData = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: nonceBuffer,
        },
        wrapKey,
        encryptedBuffer
      );

      // 6. Converter de volta para ArrayBuffer
      const groupKeyB64 = new TextDecoder().decode(decryptedData);
      const groupKeyBuffer = this.base64ToArrayBuffer(groupKeyB64);

      console.log("[CRYPTO-GROUP] Chave do grupo decifrada");

      return groupKeyBuffer;
    } catch (error) {
      console.error("[CRYPTO-GROUP] Erro ao decifrar chave do grupo:", error);
      throw error;
    }
  }

  /**
   * Cifra mensagem de grupo
   */
  static async encryptGroupMessage(
    message: string,
    groupKey: CryptoKey
  ): Promise<{ encryptedData: string; nonce: string }> {
    console.log("[CRYPTO-GROUP] Cifrando mensagem de grupo...");
    return await this.encryptMessage(message, groupKey);
  }

  /**
   * Decifra mensagem de grupo
   */
  static async decryptGroupMessage(
    encryptedData: string,
    nonce: string,
    groupKey: CryptoKey
  ): Promise<string> {
    console.log(" [CRYPTO-GROUP] Decifrando mensagem de grupo...");
    return await this.decryptMessage(encryptedData, nonce, groupKey);
  }
}

