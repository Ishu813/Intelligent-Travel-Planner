import type { LineString, Point, Polygon } from "geojson";

export type TravelMode = "bike" | "car" | "bus";
export type TripPace = "relaxed" | "moderate" | "packed";
export type RouteProfile = "fastest" | "scenic" | "safest";

export type LatLng = { lat: number; lng: number };

export type StopType =
  | "dhaba"
  | "petrol_pump"
  | "hospital"
  | "atm"
  | "hotel"
  | "rest_area";

export type Stop = {
  id: string;
  name: string;
  type: StopType;
  latitude: number;
  longitude: number;
  altitude_m?: number | null;
  rating?: number | null;
  notes?: string | null;
};

export type PermitZone = {
  id: string;
  zone_name: string;
  permit_name: string;
  fee_inr: number;
  apply_url: string;
};

export type AltitudeSample = {
  distance_km: number;
  altitude_m: number | null;
};

export type RiskSegment = {
  start_distance_km: number;
  end_distance_km: number;
  reason: string;
  suggested_rest_stop?: string;
};

export type RouteOption = {
  profile: RouteProfile;
  distance_km: number;
  duration_min: number;
  geometry: LineString;
};

export type TripFormInput = {
  from: string;
  to: string;
  startDate: string; // YYYY-MM-DD
  days: number;
  mode: TravelMode;
  budgetInr: number;
  pace: TripPace;
  routeProfile: RouteProfile;
};

export type ItineraryDay = {
  day: number;
  from: string;
  to: string;
  stops: string[];
  notes: string;
};

export type Itinerary = {
  title: string;
  days: ItineraryDay[];
  packing: string[];
  safety: string[];
};

// ─── Full AI Journey Plan (PRD v1) ───────────────────────────────────────────

export type TripPreference = "adventure" | "leisure" | "cultural" | "mixed";
export type AccommodationType = "budget" | "mid-range" | "luxury" | "hostel" | "camp";
export type TransportPreference = "cheapest" | "fastest" | "comfortable" | "ai-decides";

export type FullTripInput = {
  from: string;
  to: string;
  startDate: string; // YYYY-MM-DD
  days: number;
  travelers: number;
  budgetInr: number;
  preference: TripPreference;
  pace: TripPace;
  accommodation: AccommodationType;
  transport: TransportPreference;
};

export type TransportSegment = {
  mode: "flight" | "train" | "bus" | "cab" | "walk" | "none";
  operator: string;
  from: string;
  to: string;
  departureTime: string;
  arrivalTime: string;
  estimatedCost: number;
  bookingPlatform: string;
};

export type HotelInfo = {
  name: string;
  location: string;
  type: string;
  costPerNight: number;
  checkIn: boolean;
  checkOut: boolean;
  bookingPlatform: string;
};

export type Activity = {
  timeSlot: "morning" | "afternoon" | "evening";
  placeName: string;
  description: string;
  duration: string;
  entryFee: number;
  travelFromPrev: string;
  travelCost: number;
  lat?: number;
  lng?: number;
};

export type Meal = {
  type: "breakfast" | "lunch" | "dinner";
  restaurant: string;
  cuisine: string;
  estimatedCost: number;
};

export type JourneyDay = {
  day: number;
  date: string;
  title: string;
  transport: TransportSegment | null;
  hotel: HotelInfo | null;
  activities: Activity[];
  meals: Meal[];
  dayTotalCost: number;
  notes: string;
};

export type MapRouteSegment = {
  from: { lat: number; lng: number; name: string };
  to: { lat: number; lng: number; name: string };
  mode: "flight" | "train" | "bus" | "cab" | "walk";
  day: number;
};

export type FullJourneyPlan = {
  summary: {
    totalDays: number;
    totalDistance: string;
    estimatedCost: number;
    transportMix: string;
  };
  days: JourneyDay[];
  mapRoute: MapRouteSegment[];
};

export type PackingCategory = {
  category: string;
  items: string[];
};

