"use client";

import { useEffect, useRef, useState } from "react";

type Node = { id: string; label: string; x: number; y: number; size: number; type: string; contract?: string };
type Edge = [string, string];

export function FabricCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<Node | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const offset = useRef({ x: 0, y: 0, scale: 1 });
  const isDragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  // load live assets → nodes, fallback to hardcoded if fetch fails
  useEffect(() => {
    fetch("/api/v1/assets").then(r=>r.json()).then(j=>{
      const assets: any[] = j.assets || [];
      const liveNodes: Node[] = assets.slice(0, 13).map((a: any, i: number) => ({
        id: a.symbol.toLowerCase(),
        label: a.symbol,
        x: Math.cos(i * 2.4) * 140 + (Math.random()*20-10),
        y: Math.sin(i * 2.4) * 110 + (Math.random()*20-10),
        size: i < 3 ? 13 : i < 6 ? 10 : 8,
        type: a.type === "stock_token" ? "stock_token" : a.type,
        contract: a.contract,
      }));
      // add infra nodes
      liveNodes.push(
        { id: "uni", label: "UNI", x: 0, y: 90, size: 9, type: "dex" },
        { id: "chainlink", label: "CHAINLINK", x: -90, y: -90, size: 8, type: "oracle" },
      );
      setNodes(liveNodes);
      const liveEdges: Edge[] = liveNodes.slice(0,8).map(n=> [n.id, "uni"] as Edge);
      liveEdges.push(["chainlink","uni"]);
      setEdges(liveEdges);
    }).catch(()=>{
      setNodes([
        { id: "nvda", label: "NVDA", x: 0, y: 0, size: 14, type: "stock_token" },
        { id: "aapl", label: "AAPL", x: 120, y: -60, size: 11, type: "stock_token" },
        { id: "tsla", label: "TSLA", x: 180, y: 20, size: 10, type: "stock_token" },
        { id: "uni", label: "UNI", x: 260, y: 80, size: 9, type: "dex" },
        { id: "chainlink", label: "CHAINLINK", x: -60, y: -80, size: 8, type: "oracle" },
      ]);
      setEdges([["nvda","uni"],["aapl","uni"],["tsla","uni"],["chainlink","uni"]]);
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (!nodes.length) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    let pulse = 0;

    const draw = () => {
      pulse += 0.02;
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + offset.current.x, h / 2 + offset.current.y);
      ctx.scale(offset.current.scale, offset.current.scale);

      ctx.strokeStyle = "rgba(242,240,232,0.09)";
      ctx.lineWidth = 1;
      edges.forEach(([a, b]) => {
        const na = nodes.find((n) => n.id === a);
        const nb = nodes.find((n) => n.id === b);
        if (!na || !nb) return;
        ctx.beginPath();
        ctx.moveTo(na.x, na.y);
        ctx.lineTo(nb.x, nb.y);
        ctx.stroke();
        if (a === nodes[0]?.id) {
          const t = (Math.sin(pulse * 1.8) * 0.5 + 0.5);
          const x = na.x + (nb.x - na.x) * t;
          const y = na.y + (nb.y - na.y) * t;
          ctx.fillStyle = "#C7FF4A";
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      nodes.forEach((n) => {
        const isHover = hovered === n.id;
        const isSel = selected?.id === n.id;
        const s = n.id === nodes[0]?.id ? n.size + Math.sin(pulse * 2) * 1.2 : n.size;
        ctx.beginPath();
        ctx.arc(n.x, n.y, s, 0, Math.PI * 2);
        ctx.fillStyle = n.id === nodes[0]?.id ? "#C7FF4A" : isSel ? "#F2F0E8" : isHover ? "#F2F0E8" : n.type === "stock_token" ? "#F2F0E8" : "#10130F";
        ctx.fill();
        ctx.strokeStyle = n.id === nodes[0]?.id ? "#C7FF4A" : "rgba(242,240,232,0.18)";
        ctx.lineWidth = isSel ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = "rgba(242,240,232,0.65)";
        ctx.font = "10px Geist Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + s + 12);
      });

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    draw();

    const getPos = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect();
      const cx = ("touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX) - r.left - r.width / 2 - offset.current.x;
      const cy = ("touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY) - r.top - r.height / 2 - offset.current.y;
      return { x: cx / offset.current.scale, y: cy / offset.current.scale };
    };

    const onDown = (e: MouseEvent | TouchEvent) => {
      isDragging.current = true;
      const p = "touches" in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
      last.current = p;
    };
    const onMove = (e: MouseEvent | TouchEvent) => {
      const p = "touches" in e ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
      if (isDragging.current) {
        offset.current.x += p.x - last.current.x;
        offset.current.y += p.y - last.current.y;
        last.current = p;
      } else {
        const pos = getPos(e);
        const hit = nodes.find((n) => Math.hypot(n.x - pos.x, n.y - pos.y) < 14);
        setHovered(hit ? hit.id : null);
        canvas.style.cursor = hit ? "pointer" : isDragging.current ? "grabbing" : "grab";
      }
    };
    const onUp = (e: MouseEvent | TouchEvent) => {
      if (!isDragging.current) {
        const pos = getPos(e as any);
        const hit = nodes.find((n) => Math.hypot(n.x - pos.x, n.y - pos.y) < 14);
        if (hit) setSelected(hit);
        else setSelected(null);
      }
      isDragging.current = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      offset.current.scale = Math.max(0.5, Math.min(2.5, offset.current.scale * delta));
    };

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("touchstart", onDown, { passive: true });
    canvas.addEventListener("touchmove", onMove, { passive: true });
    canvas.addEventListener("touchend", onUp);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [nodes, edges, hovered, selected]);

  if (!nodes.length) return <div className="w-full h-full grid place-items-center bg-[#080A08] font-mono text-[11px] tracking-[0.16em] text-white/40">LOADING FABRIC — {new Date().toLocaleTimeString()} · LIVE</div>;

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full bg-[#080A08] cursor-grab active:cursor-grabbing" style={{ width: "100%", height: "100%" }} />
      {selected && (
        <div className="absolute bottom-3 left-3 right-3 md:left-auto md:right-3 md:w-[320px] border border-white/10 bg-[#10130F] p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] tracking-[0.16em]">{selected.label}</span>
            <span className="font-mono text-[10px] tracking-[0.12em] text-white/40">{selected.type.toUpperCase()} · {selected.contract ? "VERIFIED" : "INFRA"}</span>
          </div>
          {selected.contract && <div className="mt-2 font-mono text-[10px] break-all text-white/40">{selected.contract}</div>}
          <div className="mt-3 space-y-2 font-mono text-[11px]">
            <div className="flex justify-between border border-white/10 bg-[#080A08] px-3 py-2"><span className="text-white/40">EDGES</span><span>{edges.filter((e) => e[0] === selected.id || e[1] === selected.id).length} relationships</span></div>
            <div className="flex justify-between border border-white/10 bg-[#080A08] px-3 py-2"><span className="text-white/40">NODES</span><span className="text-[#C7FF4A]">{nodes.length} live</span></div>
          </div>
          <a href={selected.contract ? `https://robinhoodchain.blockscout.com/address/${selected.contract}` : "/assets"} target={selected.contract ? "_blank" : undefined} className="mt-3 block w-full text-center border border-[#C7FF4A] text-[#C7FF4A] px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] hover:bg-[#C7FF4A] hover:text-[#080A08]">VIEW ON BLOCKSCOUT ↗</a>
          <button onClick={() => setSelected(null)} className="mt-2 w-full border border-white/10 px-3 py-1.5 font-mono text-[10px] tracking-[0.12em] text-white/60 hover:bg-white hover:text-[#080A08]">CLOSE</button>
        </div>
      )}
    </div>
  );
}
