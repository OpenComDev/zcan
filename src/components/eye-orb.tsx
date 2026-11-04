/** The glossy eye sphere with a crimson orbit ring, from the agents scene of the brand film. */
export function EyeOrb({ className = "" }: { className?: string }) {
  const ring = "M40 250 C 40 185, 460 150, 470 205 C 480 262, 60 320, 40 250 Z";
  return (
    <svg viewBox="0 0 500 440" className={className} aria-hidden>
      <defs>
        <radialGradient id="orb-body" cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#d9d9de" />
          <stop offset="0.8" stopColor="#6e6e76" />
          <stop offset="1" stopColor="#1c1c20" />
        </radialGradient>
        <radialGradient id="orb-pupil" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#6b6b72" />
          <stop offset="0.4" stopColor="#141416" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
        <radialGradient id="orb-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff2d55" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ff2d55" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="orb-ring" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ff2d55" />
          <stop offset="0.5" stopColor="#3a0a14" />
          <stop offset="1" stopColor="#ff2d55" />
        </linearGradient>
        <clipPath id="orb-front">
          <rect x="0" y="232" width="500" height="208" />
        </clipPath>
      </defs>

      {/* floor glow + shadow */}
      <ellipse cx="250" cy="392" rx="170" ry="26" fill="url(#orb-glow)" />
      <ellipse cx="250" cy="388" rx="120" ry="14" fill="#000" className="opacity-70 light:opacity-15" />

      {/* back half of the ring */}
      <path d={ring} fill="none" stroke="url(#orb-ring)" strokeWidth="5" opacity="0.55" />

      <g className="orb-float">
        <circle cx="250" cy="215" r="160" fill="url(#orb-body)" />
        {/* eye */}
        <path d="M118 258c42-76 160-120 262-98-26 78-128 128-246 112-12-2-20-8-16-14Z" fill="#0c0c0e" />
        <path d="M150 248c38-50 120-80 196-70-24 54-100 88-196 70Z" fill="#f1f1f3" />
        <circle cx="252" cy="218" r="40" fill="url(#orb-pupil)" />
        <ellipse cx="238" cy="203" rx="10" ry="7" fill="#fff" opacity="0.8" />
        {/* specular */}
        <ellipse cx="190" cy="120" rx="48" ry="22" fill="#fff" opacity="0.5" transform="rotate(-28 190 120)" />
      </g>

      {/* front half of the ring */}
      <path d={ring} fill="none" stroke="#ff2d55" strokeWidth="5" clipPath="url(#orb-front)" />
      <circle r="5" fill="#fff" className="motion-reduce:hidden">
        <animateMotion dur="7s" repeatCount="indefinite" path={ring} />
      </circle>

    </svg>
  );
}
