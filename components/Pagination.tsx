"use client";

export default function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-[12.5px] text-muted">
        Halaman {page} dari {totalPages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          className="rounded-full border border-cardGreenDark/30 px-4 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-cardGreenDark/10 transition-colors disabled:opacity-40"
        >
          Sebelumnya
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="rounded-full border border-cardGreenDark/30 px-4 py-1.5 text-[12.5px] font-semibold text-ink hover:bg-cardGreenDark/10 transition-colors disabled:opacity-40"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
