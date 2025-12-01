-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "senderEncryptedData" TEXT,
ADD COLUMN     "senderEphemPkForSelf" TEXT,
ADD COLUMN     "senderNonce" TEXT;
