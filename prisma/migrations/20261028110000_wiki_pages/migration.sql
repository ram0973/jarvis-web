-- DropTable
DROP TABLE "Idea";

-- CreateTable
CREATE TABLE "wiki_page" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "parentId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wiki_page_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wiki_page_slug_key" ON "wiki_page"("slug");

-- CreateIndex
CREATE INDEX "wiki_page_parentId_idx" ON "wiki_page"("parentId");

-- AddForeignKey
ALTER TABLE "wiki_page" ADD CONSTRAINT "wiki_page_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "wiki_page"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
