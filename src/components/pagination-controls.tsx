import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  createHref: (page: number) => string;
};

function getPages(page: number, totalPages: number) {
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);

  return Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((left, right) => left - right);
}

export function PaginationControls({
  page,
  totalPages,
  createHref,
}: PaginationControlsProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = getPages(page, totalPages);

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href={createHref(Math.max(1, page - 1))}
            className={page === 1 ? "pointer-events-none opacity-40" : ""}
          />
        </PaginationItem>
        {pages.map((value, index) => {
          const previous = pages[index - 1];
          const showEllipsis = previous && value - previous > 1;

          return (
            <div key={value} className="flex items-center">
              {showEllipsis ? (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : null}
              <PaginationItem>
                <PaginationLink href={createHref(value)} isActive={value === page}>
                  {value}
                </PaginationLink>
              </PaginationItem>
            </div>
          );
        })}
        <PaginationItem>
          <PaginationNext
            href={createHref(Math.min(totalPages, page + 1))}
            className={page === totalPages ? "pointer-events-none opacity-40" : ""}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}