import { FolderBrowser } from "@/components/tree/FolderBrowser";
import { Breadcrumbs } from "@/components/tree/Breadcrumbs";

export default async function FolderPage({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  return (
    <>
      <Breadcrumbs folderId={folderId} />
      <FolderBrowser folderId={folderId} />
    </>
  );
}
