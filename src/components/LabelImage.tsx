import { LABEL_W, LABEL_H } from "@/constants";

interface Props {
  variant: "master" | "revised";
  pairId: string;
}

/**
 * Renders a mock medical label as SVG so bounding box overlays line up
 * with real visible content. Slight variations between master/revised.
 */
export function LabelImage({ variant, pairId }: Props) {
  const isRevised = variant === "revised";
  const lot = isRevised ? "22A118" : "22A114";
  const dose = pairId === "p1" && isRevised ? "500 mg / 5 mL" : "250 mg / 5 mL";
  const expFmt =
    pairId === "p1" && isRevised ? "EXP 04/2026" : "EXP 2026-04";
  const mahName =
    pairId === "p4" && isRevised
      ? "MedCo Pharmaceuticals Ltd."
      : "MedCo Pharma Ltd.";
  const apiName =
    pairId === "p2" && !isRevised ? "Paracetomol" : "Paracetamol";
  const gtin =
    pairId === "p1" && isRevised ? "0030123456791 3" : "0030123456789 0";

  return (
    <svg
      viewBox={`0 0 ${LABEL_W} ${LABEL_H}`}
      width="100%"
      height="100%"
      style={{ display: "block", background: "#FFFFFF" }}
    >
      <rect x="0" y="0" width={LABEL_W} height={LABEL_H} fill="#FFFFFF" />

      {/* Brand bar */}
      <rect x="20" y="20" width={LABEL_W - 40} height="100" fill="#F8F9FA" stroke="#E0E0E0" />
      <text x="40" y="70" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="700" fill="#1A1A2E">
        MedCo
      </text>
      <text x="40" y="92" fontFamily="Inter, sans-serif" fontSize="11" fill="#5F6368">
        Pharmaceutical Product
      </text>

      {/* Logo block (right) */}
      <rect x="420" y="40" width="140" height="60" fill="#FFFFFF" stroke="#1A1A2E" rx={isRevised && pairId === "p1" ? 10 : 0} />
      <text x="490" y="76" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="700" fill="#1A1A2E">
        {isRevised && pairId === "p1" ? "MedCo°" : "MedCo"}
      </text>

      {/* Dose */}
      <text x="40" y="170" fontFamily="Inter, sans-serif" fontSize="13" fill="#5F6368">Strength</text>
      <text x="40" y="205" fontFamily="Inter, sans-serif" fontSize="24" fontWeight="700" fill="#1A1A2E">
        {dose}
      </text>

      {/* API */}
      <text x="40" y="250" fontFamily="Inter, sans-serif" fontSize="13" fill="#5F6368">Active ingredient</text>
      <text x="40" y="280" fontFamily="Inter, sans-serif" fontSize="20" fontWeight="600" fill="#1A1A2E">
        {apiName}
      </text>

      {/* Indication */}
      <line x1="40" y1="310" x2={LABEL_W - 40} y2="310" stroke="#E0E0E0" />
      <text x="40" y="340" fontFamily="Inter, sans-serif" fontSize="12" fill="#5F6368">Indication</text>
      <text x="40" y="362" fontFamily="Inter, sans-serif" fontSize="13" fill="#1A1A2E">
        For the temporary relief of mild to moderate pain and fever.
      </text>
      <text x="40" y="382" fontFamily="Inter, sans-serif" fontSize="13" fill="#1A1A2E">
        Read leaflet before use.
      </text>

      {/* Posology */}
      <text x="40" y="420" fontFamily="Inter, sans-serif" fontSize="12" fill="#5F6368">Dosage</text>
      <text x="40" y="442" fontFamily="Inter, sans-serif" fontSize="13" fill="#1A1A2E">
        Adults: 1–2 tablets every 4–6 hours as needed.
      </text>

      {/* MAH */}
      <text x="40" y="478" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="600" fill="#1A1A2E">
        {mahName}
      </text>
      <text x="40" y="496" fontFamily="Inter, sans-serif" fontSize="11" fill="#5F6368">
        14 Industrial Way, Dublin, Ireland
      </text>

      {/* Symbols row */}
      <text x="40" y="560" fontFamily="Inter, sans-serif" fontSize="12" fill="#5F6368">Storage & handling</text>
      {/* Warning triangle (images box, p4) */}
      <g transform="translate(40,600)">
        <polygon
          points={isRevised && pairId === "p4" ? "36,2 70,68 2,68" : "30,2 58,58 2,58"}
          fill="none"
          stroke="#1A1A2E"
          strokeWidth="2"
        />
        <text x={isRevised && pairId === "p4" ? 36 : 30} y={isRevised && pairId === "p4" ? 50 : 44} textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="22" fontWeight="700" fill="#1A1A2E">!</text>
      </g>
      {/* Storage symbol (S1, p1) */}
      <g transform="translate(420,600)">
        <rect x="0" y="0" width="60" height="60" fill="none" stroke="#1A1A2E" strokeWidth="2" />
        {isRevised && pairId === "p1" ? (
          <>
            <text x="30" y="28" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#1A1A2E">2–8°C</text>
            <text x="30" y="46" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#5F6368">store</text>
          </>
        ) : (
          <>
            <text x="30" y="28" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="11" fontWeight="600" fill="#1A1A2E">&lt;25°C</text>
            <text x="30" y="46" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="9" fill="#5F6368">store</text>
          </>
        )}
      </g>
      {/* Damaged symbol (S1, p2) */}
      {pairId === "p2" && isRevised && (
        <g transform="translate(500,600)">
          <circle cx="30" cy="30" r="28" fill="none" stroke="#1A1A2E" strokeWidth="2" />
          <line x1="10" y1="50" x2="50" y2="10" stroke="#1A1A2E" strokeWidth="2" />
        </g>
      )}

      {/* Expiry / lot */}
      <text x="40" y="710" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="600" fill="#1A1A2E">
        {expFmt}
      </text>
      <text x="240" y="710" fontFamily="Inter, sans-serif" fontSize="14" fontWeight="600" fill="#1A1A2E">
        LOT {lot}
      </text>

      {/* Barcode */}
      <g transform="translate(40,740)">
        <rect x="0" y="0" width="360" height="50" fill="#FFFFFF" />
        {Array.from({ length: 48 }).map((_, i) => {
          const seed = (i * (isRevised ? 7 : 5) + pairId.charCodeAt(1)) % 5;
          const w = seed === 0 ? 4 : seed === 1 ? 2 : 3;
          return (
            <rect
              key={i}
              x={i * 7 + 4}
              y="2"
              width={w}
              height="34"
              fill="#1A1A2E"
            />
          );
        })}
        <text x="180" y="48" textAnchor="middle" fontFamily="Inter, sans-serif" fontSize="10" fill="#1A1A2E">
          {gtin}
        </text>
      </g>
    </svg>
  );
}
