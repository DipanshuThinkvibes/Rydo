import type { CarType } from '@rydo/shared';

/**
 * Popular cars in India, so a driver can type "Swift" and get make, model and body type filled in.
 * Not a complete list: any other car can still be typed in by hand.
 */
export interface CarModel {
  make: string;
  model: string;
  type: CarType;
}

const list = (make: string, type: CarType, models: string[]): CarModel[] => models.map((model) => ({ make, model, type }));

export const CAR_MODELS: CarModel[] = [
  ...list('Maruti Suzuki', 'HATCHBACK', ['Alto K10', 'S-Presso', 'Celerio', 'Wagon R', 'Swift', 'Baleno', 'Ignis']),
  ...list('Maruti Suzuki', 'SEDAN', ['Dzire', 'Ciaz']),
  ...list('Maruti Suzuki', 'COMPACT_SUV', ['Brezza', 'Fronx']),
  ...list('Maruti Suzuki', 'SUV', ['Grand Vitara', 'Jimny']),
  ...list('Maruti Suzuki', 'MUV', ['Ertiga', 'XL6', 'Invicto', 'Eeco']),
  ...list('Hyundai', 'HATCHBACK', ['Grand i10 Nios', 'i20']),
  ...list('Hyundai', 'SEDAN', ['Aura', 'Verna']),
  ...list('Hyundai', 'COMPACT_SUV', ['Exter', 'Venue']),
  ...list('Hyundai', 'SUV', ['Creta', 'Alcazar', 'Tucson', 'Ioniq 5']),
  ...list('Tata', 'HATCHBACK', ['Tiago', 'Tiago EV', 'Altroz']),
  ...list('Tata', 'SEDAN', ['Tigor', 'Tigor EV']),
  ...list('Tata', 'COMPACT_SUV', ['Punch', 'Punch EV', 'Nexon', 'Nexon EV']),
  ...list('Tata', 'SUV', ['Curvv', 'Harrier', 'Safari']),
  ...list('Mahindra', 'COMPACT_SUV', ['XUV 3XO', 'Bolero Neo']),
  ...list('Mahindra', 'SUV', ['Thar', 'Thar Roxx', 'Scorpio N', 'Scorpio Classic', 'XUV700', 'XUV 400', 'BE 6', 'XEV 9e']),
  ...list('Mahindra', 'MUV', ['Bolero', 'Marazzo']),
  ...list('Kia', 'COMPACT_SUV', ['Sonet', 'Syros']),
  ...list('Kia', 'SUV', ['Seltos', 'EV6']),
  ...list('Kia', 'MUV', ['Carens', 'Carnival']),
  ...list('Toyota', 'HATCHBACK', ['Glanza']),
  ...list('Toyota', 'COMPACT_SUV', ['Urban Cruiser Taisor']),
  ...list('Toyota', 'SUV', ['Urban Cruiser Hyryder', 'Fortuner', 'Hilux']),
  ...list('Toyota', 'MUV', ['Rumion', 'Innova Crysta', 'Innova Hycross']),
  ...list('Toyota', 'SEDAN', ['Camry']),
  ...list('Honda', 'HATCHBACK', ['Jazz']),
  ...list('Honda', 'SEDAN', ['Amaze', 'City', 'City Hybrid']),
  ...list('Honda', 'SUV', ['Elevate']),
  ...list('Renault', 'HATCHBACK', ['Kwid']),
  ...list('Renault', 'COMPACT_SUV', ['Kiger']),
  ...list('Renault', 'MUV', ['Triber']),
  ...list('Nissan', 'COMPACT_SUV', ['Magnite']),
  ...list('Volkswagen', 'SEDAN', ['Virtus']),
  ...list('Volkswagen', 'SUV', ['Taigun', 'Tiguan']),
  ...list('Skoda', 'SEDAN', ['Slavia', 'Superb']),
  ...list('Skoda', 'COMPACT_SUV', ['Kylaq']),
  ...list('Skoda', 'SUV', ['Kushaq', 'Kodiaq']),
  ...list('MG', 'HATCHBACK', ['Comet EV']),
  ...list('MG', 'SUV', ['Astor', 'Hector', 'Hector Plus', 'ZS EV', 'Gloster', 'Windsor EV']),
  ...list('Citroen', 'HATCHBACK', ['C3']),
  ...list('Citroen', 'SUV', ['Basalt', 'C3 Aircross', 'C5 Aircross']),
  ...list('Jeep', 'SUV', ['Compass', 'Meridian', 'Wrangler']),
  ...list('BYD', 'SUV', ['Atto 3']),
  ...list('BYD', 'MUV', ['eMAX 7']),
  ...list('BMW', 'LUXURY', ['3 Series', '5 Series', 'X1', 'X3', 'X5', 'iX1']),
  ...list('Mercedes-Benz', 'LUXURY', ['A-Class Limousine', 'C-Class', 'E-Class', 'GLA', 'GLC', 'GLE']),
  ...list('Audi', 'LUXURY', ['A4', 'A6', 'Q3', 'Q5', 'Q7']),
  ...list('Volvo', 'LUXURY', ['XC40', 'XC60', 'XC90']),
  ...list('Lexus', 'LUXURY', ['ES', 'NX']),
];

/** Up to `max` cars whose make or model contains every word typed ("swift", "maruti swi", "innova"). */
export function findCars(q: string, max = 8): CarModel[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return CAR_MODELS.filter((c) => {
    const text = `${c.make} ${c.model}`.toLowerCase();
    return words.every((w) => text.includes(w));
  }).slice(0, max);
}
