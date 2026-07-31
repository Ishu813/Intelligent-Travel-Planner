import type { AltitudeSample, PermitZone, RiskSegment, Stop } from "@trip-planner/shared/types";
import { TripViewer } from "@/components/TripViewer";
import type { LineString } from "geojson";
import { getApiBaseUrl } from "@/lib/apiBaseUrl";

export default async function TripPage({ params }: { params: { uuid: string } }) {
  const res = await fetch(`${getApiBaseUrl()}/trips/${params.uuid}`, {
    cache: "no-store"
  });

  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-semibold">Trip not found</h1>
        <p className="mt-2 text-sm text-zinc-300">
          This link may be invalid or the trip may have been removed.
        </p>
      </div>
    );
  }

  const json = (await res.json()) as {
    title: string;
    route: LineString;
    itinerary: unknown | null;
    stops: Stop[];
    permitZones: PermitZone[];
    altitude: AltitudeSample[];
    risk: RiskSegment[];
  };

  return <TripViewer data={json} />;
}

