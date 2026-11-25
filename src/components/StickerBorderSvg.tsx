import React from 'react';
import { BorderStyle } from '../types';

interface StickerBorderSvgProps {
  styleType: BorderStyle;
}

export const StickerBorderSvg: React.FC<StickerBorderSvgProps> = ({ styleType }) => {
  if (styleType === 'none') return null;

  if (styleType === 'simple-double') {
    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 200 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="196" height="116" fill="none" stroke="#1A1B22" strokeWidth="1.6" />
        <rect x="6" y="6" width="188" height="108" fill="none" stroke="#1A1B22" strokeWidth="0.9" />
      </svg>
    );
  }

  if (styleType === 'rounded-single') {
    return (
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 200 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          x="2"
          y="2"
          width="196"
          height="116"
          rx="10"
          ry="10"
          fill="none"
          stroke="#1A1B22"
          strokeWidth="1.5"
        />
      </svg>
    );
  }

  // Ornate Notched Double
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 200 120"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M 14,2 L 186,2 A 12,12 0 0 0 198,14 L 198,106 A 12,12 0 0 0 186,118 L 14,118 A 12,12 0 0 0 2,106 L 2,14 A 12,12 0 0 0 14,2 Z"
        fill="none"
        stroke="#1A1B22"
        strokeWidth="1.6"
      />
      <path
        d="M 17,6 L 183,6 A 10,10 0 0 0 194,17 L 194,103 A 10,10 0 0 0 183,114 L 17,114 A 10,10 0 0 0 6,103 L 6,17 A 10,10 0 0 0 17,6 Z"
        fill="none"
        stroke="#1A1B22"
        strokeWidth="0.85"
      />
    </svg>
  );
};
