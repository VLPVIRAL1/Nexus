import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { FileScanner, ObjectStore } from "@/services/source-file-service";
import { SourceFileError } from "@/services/source-file-service";
import { databasePool } from "./database";

export class DatabaseEncryptedObjectStore implements ObjectStore {
  async putQuarantined(key: string, bytes: Uint8Array): Promise<{ storageId: string; version: string }> {
    const storageId=randomUUID();const iv=randomBytes(12);const cipher=createCipheriv("aes-256-gcm",sourceEncryptionKey(),iv);cipher.setAAD(Buffer.from(key));const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);const authTag=cipher.getAuthTag();
    await databasePool().query("INSERT INTO source_object_blobs(id,object_key,object_state,cipher_iv,cipher_auth_tag,cipher_bytes) VALUES($1,$2,'quarantined',$3,$4,$5)",[storageId,key,iv,authTag,encrypted]);
    return {storageId,version:"1"};
  }
  async promote(storageId:string,version:string):Promise<void>{const result=await databasePool().query("UPDATE source_object_blobs SET object_state='promoted',promoted_at=now() WHERE id=$1 AND storage_version=$2 AND object_state='quarantined'",[storageId,Number(version)]);if(result.rowCount!==1)throw new SourceFileError("FILE_STORAGE_CONFLICT","The quarantined object could not be promoted.");}
  async createAuthorizedReadUrl():Promise<string>{throw new SourceFileError("FILE_PROXY_REQUIRED","Database-backed source objects must be read through the authenticated proxy.");}
  async readPromoted(storageId:string):Promise<Buffer>{const result=await databasePool().query<{object_key:string;object_state:string;cipher_iv:Buffer;cipher_auth_tag:Buffer;cipher_bytes:Buffer}>("SELECT object_key,object_state,cipher_iv,cipher_auth_tag,cipher_bytes FROM source_object_blobs WHERE id=$1",[storageId]);const row=result.rows[0];if(!row||row.object_state!=="promoted")throw new SourceFileError("FILE_NOT_AVAILABLE","The source object is not available.");try{const decipher=createDecipheriv("aes-256-gcm",sourceEncryptionKey(),row.cipher_iv);decipher.setAAD(Buffer.from(row.object_key));decipher.setAuthTag(row.cipher_auth_tag);return Buffer.concat([decipher.update(row.cipher_bytes),decipher.final()]);}catch{throw new SourceFileError("FILE_INTEGRITY_FAILED","The encrypted source object failed integrity verification.");}}
}

export class ConfiguredFileScanner implements FileScanner {
  async scan(bytes:Uint8Array):Promise<{clean:boolean;scannerVersion:string;reason?:string}>{
    if(process.env.APP_ENV==="production")throw new SourceFileError("SCANNER_NOT_CONFIGURED","A production malware-scanner adapter is required before source uploads can be enabled.");
    const buffer=Buffer.from(bytes);const findings=[Buffer.from("EICAR-STANDARD-ANTIVIRUS-TEST-FILE"),Buffer.from("/JavaScript"),Buffer.from("/Launch"),Buffer.from("/OpenAction")];const found=findings.find(pattern=>buffer.indexOf(pattern)!==-1);return found?{clean:false,scannerVersion:"development-static-v1",reason:`Blocked active/test signature ${found.toString()}`}:{clean:true,scannerVersion:"development-static-v1"};
  }
}

function sourceEncryptionKey():Buffer{const configured=process.env.NEXUS_SOURCE_ENCRYPTION_KEY;if(configured){const key=Buffer.from(configured,"base64");if(key.byteLength!==32)throw new Error("NEXUS_SOURCE_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");return key;}if(process.env.APP_ENV==="production")throw new Error("NEXUS_SOURCE_ENCRYPTION_KEY is required in production.");return createHash("sha256").update("nexus-development-source-key-not-for-production").digest();}
