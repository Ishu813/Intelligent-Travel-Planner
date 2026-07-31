"use client";

import type { AltitudeSample, PermitZone, RiskSegment, Stop } from "@trip-planner/shared/types";
import { MapView } from "@/components/MapView";
import { StopsPanel } from "@/components/StopsPanel";
import { PermitCard } from "@/components/PermitCard";
import { AltitudeChart } from "@/components/AltitudeChart";
import type { LineString } from "geojson";

export function TripViewer({
  data
}: {
  data: {
    title: string;
    route: LineString;
    itinerary: any;
    stops: Stop[];
    permitZones: PermitZone[];
    altitude: AltitudeSample[];
    risk: RiskSegment[];
  };
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <div className="text-xs text-zinc-400">Shared trip</div>
        <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          {data.permitZones.length ? <PermitCard zones={data.permitZones} /> : null}
          <StopsPanel stops={data.stops} />
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="text-sm font-medium">Itinerary (read-only)</div>
            <pre className="mt-3 max-h-[360px] overflow-auto rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs text-zinc-100">
              {JSON.stringify(data.itinerary, null, 2)}
            </pre>
          </div>
        </div>

        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
            <MapView route={data.route} stops={data.stops} />
          </div>
          <AltitudeChart altitude={data.altitude} risk={data.risk} />
        </div>
      </div>
    </div>
  );
}

