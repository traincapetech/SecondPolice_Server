-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD';

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "displayCurrency" TEXT NOT NULL DEFAULT 'USD';
