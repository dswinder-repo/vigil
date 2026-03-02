export function ScanlineOverlay() {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden opacity-[0.03]">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 240, 255, 0.5) 2px, rgba(0, 240, 255, 0.5) 4px)',
          backgroundSize: '100% 4px',
        }}
      />
      <div
        className="absolute left-0 right-0 h-[200px] opacity-60"
        style={{
          background: 'linear-gradient(180deg, rgba(0,240,255,0.1) 0%, transparent 100%)',
          animation: 'scanline 8s linear infinite',
        }}
      />
    </div>
  );
}
