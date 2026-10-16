"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const INTERVAL_MS = 5000;

/**
 * Carousel banner: các slide (render sẵn ở server) nằm trong hàng cuộn ngang CSS scroll-snap — vuốt được kể cả khi
 * chưa tải JS. Phần client chỉ thêm: tự chuyển 5s, chấm tròn, mũi tên (desktop).
 * Không tự chuyển khi: người dùng đang chạm/rê chuột/focus, prefers-reduced-motion, carousel ngoài màn hình, tab ẩn.
 */
export function BannerCarousel({
  count,
  labels,
  children,
}: {
  count: number;
  labels: { region: string; prev: string; next: string; goTo: string[] };
  children: React.ReactNode;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const visible = useRef(true);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const next = (i + count) % count;
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const el = track.current;
    if (!el || count < 2) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    const io = new IntersectionObserver(([e]) => (visible.current = e.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      if (paused.current || !visible.current || reduce.matches || document.hidden) return;
      const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      el.scrollTo({ left: ((i + 1) % count) * el.clientWidth, behavior: "smooth" });
    }, INTERVAL_MS);
    return () => {
      el.removeEventListener("scroll", onScroll);
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [count]);

  const pause = () => (paused.current = true);
  const resume = () => (paused.current = false);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={labels.region}
      className="group relative overflow-hidden rounded-xl"
      onPointerEnter={pause}
      onPointerLeave={resume}
      onTouchStart={pause}
      onFocus={pause}
      onBlur={resume}
      data-testid="banner-carousel"
    >
      <ul
        ref={track}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label={labels.prev}
            className="absolute top-1/2 left-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-card/80 text-foreground shadow-md hover:bg-card lg:grid"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label={labels.next}
            className="absolute top-1/2 right-3 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-card/80 text-foreground shadow-md hover:bg-card lg:grid"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {labels.goTo.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => go(i)}
                aria-label={label}
                aria-current={i === index ? "true" : undefined}
                className="grid size-6 place-items-center"
              >
                <span className={`block h-2 rounded-full shadow transition-all ${i === index ? "w-5 bg-card" : "w-2 bg-card/50"}`} />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
