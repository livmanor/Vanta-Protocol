import React from 'react';

const MARK_SRC = '/brand/vanta-mark.png';

/** Exact brand mark PNG used next to "Vanta Protocol". */
export default function VantaMark({ size = 28, className = '' }) {
  return (
    <img
      src={MARK_SRC}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`shrink-0 rounded-[7px] object-cover select-none ${className}`.trim()}
      style={{ width: size, height: size }}
    />
  );
}
