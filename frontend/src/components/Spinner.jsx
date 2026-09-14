export default function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-[#839682]" data-testid="spinner">
      <div className="h-8 w-8 rounded-full border-2 border-[#E5E6DF] border-t-[#B25A45] animate-spin" />
      {label && <span className="text-xs uppercase tracking-widest">{label}</span>}
    </div>
  );
}
