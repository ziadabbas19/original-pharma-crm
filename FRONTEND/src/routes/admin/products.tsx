import { createFileRoute } from '@tanstack/react-router'
import { Can } from '@/components/Can'
import { NoAccess } from '@/components/NoAccess'
import { CatalogPage } from '@/features/catalog/CatalogPage'
import { P } from '@/lib/permissions'

export const Route = createFileRoute('/admin/products')({
  component: () => (
    <Can permission={P.products.read} fallback={<NoAccess />}>
      <CatalogPage />
    </Can>
  ),
})
