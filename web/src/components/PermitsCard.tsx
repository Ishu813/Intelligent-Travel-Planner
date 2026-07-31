"use client";

import type { FullJourneyPlan } from "@trip-planner/shared/types";

type PermitInfo = {
  permit: string;
  requiredFor: string;
  howToGet: string;
  cost: string;
  processingTime: string;
  note: string;
};

// Static lookup — keywords that trigger each permit requirement
const PERMIT_LOOKUP: Array<{ keywords: string[]; info: PermitInfo }> = [
  {
    keywords: ["north sikkim", "lachen", "lachung", "gurudongmar", "sikkim"],
    info: {
      permit: "Inner Line Permit (ILP) — North Sikkim",
      requiredFor: "Lachen, Lachung, Gurudongmar Lake",
      howToGet: "Apply online at sikkim.gov.in or at Sikkim Tourism office in Gangtok",
      cost: "Free",
      processingTime: "Same day if applied in Gangtok",
      note: "Carry 2 passport photos and Aadhaar / Passport",
    },
  },
  {
    keywords: ["pangong", "pangong tso", "pangong lake"],
    info: {
      permit: "Inner Line Permit — Pangong Lake",
      requiredFor: "Pangong Tso",
      howToGet: "DC Office Leh or online at lahdcleh.nic.in",
      cost: "₹100 per person",
      processingTime: "1–2 hours",
      note: "Foreign nationals require Protected Area Permit (PAP) too",
    },
  },
  {
    keywords: ["nubra", "nubra valley", "hunder", "diskit"],
    info: {
      permit: "Inner Line Permit — Nubra Valley",
      requiredFor: "Nubra Valley, Hunder, Diskit",
      howToGet: "DC Office Leh or online at lahdcleh.nic.in",
      cost: "₹100 per person",
      processingTime: "1–2 hours",
      note: "Can be combined with Pangong permit in one application",
    },
  },
  {
    keywords: ["spiti", "kaza", "key monastery", "chandratal", "pin valley"],
    info: {
      permit: "Inner Line Permit — Spiti Valley",
      requiredFor: "Spiti Valley border areas",
      howToGet: "SDM office in Kaza or Shimla district collectorate",
      cost: "Free",
      processingTime: "Same day",
      note: "Required for areas near Tibet border. Carry 2 photos + ID",
    },
  },
  {
    keywords: ["chopta", "tungnath", "deoriatal", "kedarnath", "badrinath"],
    info: {
      permit: "Eco-Tourism Entry Fee — Chopta / Kedarnath area",
      requiredFor: "Tungnath trek, Chandrashila",
      howToGet: "Paid at forest checkpost entrance",
      cost: "₹150 per person",
      processingTime: "On the spot",
      note: "Vehicles need separate entry fee. No advance booking required",
    },
  },
  {
    keywords: ["arunachal", "tawang", "ziro", "bomdila"],
    info: {
      permit: "Inner Line Permit (ILP) — Arunachal Pradesh",
      requiredFor: "All of Arunachal Pradesh for non-residents",
      howToGet: "Online at arunachalilp.com or at FRRO/Resident Commissioner offices",
      cost: "₹100–200 per person",
      processingTime: "2–3 days online",
      note: "Mandatory for all Indian citizens except Arunachal residents",
    },
  },
  {
    keywords: ["mizoram", "manipur", "nagaland"],
    info: {
      permit: "Inner Line Permit — Northeast State",
      requiredFor: "Entry into the state for non-residents",
      howToGet: "Apply at Resident Commissioner offices in Delhi / Kolkata, or online portals",
      cost: "Free to ₹200",
      processingTime: "1–5 days",
      note: "Requirements differ per state — check each state's official tourism site",
    },
  },
];

// Scan the plan for keywords that require permits
function detectPermits(plan: FullJourneyPlan): PermitInfo[] {
  const text = JSON.stringify(plan).toLowerCase();
  const found: PermitInfo[] = [];
  const seen = new Set<string>();

  for (const entry of PERMIT_LOOKUP) {
    if (entry.keywords.some((kw) => text.includes(kw))) {
      if (!seen.has(entry.info.permit)) {
        seen.add(entry.info.permit);
        found.push(entry.info);
      }
    }
  }
  return found;
}

export function PermitsCard({ plan }: { plan: FullJourneyPlan }) {
  const permits = detectPermits(plan);
  if (permits.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-700/40 bg-amber-950/20 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">📋</span>
        <h3 className="text-sm font-semibold text-amber-200">Permits Required for This Trip</h3>
      </div>
      <div className="space-y-3">
        {permits.map((p, i) => (
          <div key={i} className="rounded-xl border border-amber-700/30 bg-amber-950/30 p-3">
            <div className="flex items-start gap-2 mb-2">
              <span className="text-amber-400 text-sm mt-0.5">⚠️</span>
              <div className="font-semibold text-sm text-amber-200">{p.permit}</div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px]">
              <div><span className="text-amber-600">Required for:</span> <span className="text-amber-100/80">{p.requiredFor}</span></div>
              <div><span className="text-amber-600">Cost:</span> <span className="text-amber-100/80">{p.cost}</span></div>
              <div><span className="text-amber-600">How to get:</span> <span className="text-amber-100/80">{p.howToGet}</span></div>
              <div><span className="text-amber-600">Processing:</span> <span className="text-amber-100/80">{p.processingTime}</span></div>
            </div>
            {p.note && (
              <div className="mt-1.5 text-[10px] text-amber-500/80 italic">{p.note}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
