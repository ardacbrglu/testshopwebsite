"use client";

export default function QuantityStepper({
  value,
  min = 1,
  max = 99,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
}) {
  function inc() {
    onChange(Math.min(max, value + 1));
  }
  function dec() {
    onChange(Math.max(min, value - 1));
  }
  return (
    <div className="inline-flex items-center border border-neutral-700 rounded-lg overflow-hidden">
      <button type="button" onClick={dec} className="px-3 py-2 hover:bg-neutral-900">-</button>
      <div className="px-3 py-2 w-10 text-center select-none">{value}</div>
      <button type="button" onClick={inc} className="px-3 py-2 hover:bg-neutral-900">+</button>
    </div>
  );
}
