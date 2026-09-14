export default function EmptyState({ title, subtitle, action }) {
  return (
    <div className="mx-auto max-w-md text-center py-16 px-6">
      <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-[#F2F2EC] flex items-center justify-center">
        <span className="serif text-2xl text-[#839682]">◯</span>
      </div>
      <h3 className="serif text-2xl mb-2">{title}</h3>
      {subtitle && <p className="text-sm text-[#6B7269] leading-relaxed">{subtitle}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
