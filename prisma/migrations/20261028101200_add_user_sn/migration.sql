-- AlterTable
ALTER TABLE "user" ADD COLUMN     "sn" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_sn_key" ON "user"("sn");
