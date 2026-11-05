"use client";

import { useRef, useState } from "react";
import Image from "next/image";

/** Chỉ ảnh tương tác cần JS; tên, giá và form mua vẫn do server render. */
export function ProductGallery({ images, name, imageLabel }: { images: { url: string; alt: string | null }[]; name: string; imageLabel: string }) {
  const [index, setIndex] = useState(0);
  const start = useRef<number | null>(null);
  const move = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);
  const image = images[index];
  return <div className="space-y-2" role="group" aria-label={name} tabIndex={images.length > 1 ? 0 : undefined}
    onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); move(e.key === "ArrowRight" ? 1 : -1); } }}
    onTouchStart={(e) => { start.current = e.touches[0]?.clientX ?? null; }}
    onTouchEnd={(e) => { const end = e.changedTouches[0]?.clientX; if (start.current != null && end != null && Math.abs(end - start.current) > 50) move(end < start.current ? 1 : -1); start.current = null; }}>
    <div className="relative aspect-square overflow-hidden rounded-xl bg-accent">
      <Image src={image.url} alt={image.alt ?? name} fill priority={index === 0} sizes="(min-width: 1024px) 540px, (max-width: 768px) 100vw, 720px" className="object-cover" />
    </div>
    {images.length > 1 && <ul className="flex gap-2 overflow-x-auto">{images.map((img, i) => <li key={`${img.url}-${i}`}><button type="button" aria-label={`${imageLabel} ${i + 1}`} aria-pressed={i === index} onClick={() => setIndex(i)} className="relative block size-20 shrink-0 overflow-hidden rounded-md bg-accent ring-brand aria-pressed:ring-2"><Image src={img.url} alt="" fill sizes="80px" className="object-cover" /></button></li>)}</ul>}
  </div>;
}
