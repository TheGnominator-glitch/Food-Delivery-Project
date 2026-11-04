// Development seed data. Prices are in credits (1 credit = 1,000 COP).
// Restaurants are fictional; their locations are real spots in Pereira.
// FR13: a paid extra and its price for one item
export interface SeedExtra {
  name: string;
  price: number; 
}

// FR12, FR13: a menu item and its options
export interface SeedItem {
  name: string;
  price: number; 
  description?: string;
  customizations?: string[]; 
  extras?: SeedExtra[]; 
}

// FR9: a restaurant; latitude and longitude stay null until real coordinates are known
export interface SeedRestaurant {
  name: string;
  category: string;
  spot: string; 
  latitude: number | null; 
  longitude: number | null;
  items: SeedItem[];
}

// FR10: the restaurant categories
export const categories = ["Hamburguesas", "Pizza", "Comida típica", "Pollo", "Sushi", "Postres"];

// FR9 test layout: three restaurants in a west cluster, three in a center cluster about 7 km away,
// and two far away (Cerritos road, Mirador Buenavida), so "nearby" can be tested from either cluster
export const restaurants: SeedRestaurant[] = [
  {
    name: "La Parrilla de la 30",
    category: "Hamburguesas",
    spot: "Av. 30 de Agosto #103-84 (west)",
    latitude: 4.814115,
    longitude: -75.763185,
    items: [
      {
        name: "Hamburguesa clásica",
        price: 22,
        description: "Carne de res, queso, lechuga y tomate",
        customizations: ["Sin cebolla", "Sin tomate", "Sin salsas"],
        extras: [
          { name: "Queso extra", price: 3 },
          { name: "Tocineta", price: 4 },
          { name: "Huevo frito", price: 3 },
        ],
      },
      {
        name: "Hamburguesa doble",
        price: 30,
        description: "Doble carne y doble queso",
        customizations: ["Sin cebolla", "Sin salsas"],
        extras: [
          { name: "Tocineta", price: 4 },
          { name: "Huevo frito", price: 3 },
        ],
      },
      {
        name: "Hamburguesa de pollo",
        price: 24,
        description: "Pechuga apanada con salsa de la casa",
        customizations: ["Sin salsas"],
        extras: [{ name: "Queso extra", price: 3 }],
      },
      { name: "Papas a la francesa", price: 8, extras: [{ name: "Queso extra", price: 3 }] },
      { name: "Limonada de coco", price: 9 },
    ],
  },
  {
    name: "Doble Smash",
    category: "Hamburguesas",
    spot: "Cra. 12 #2-78 (center)",
    latitude: 4.809378,
    longitude: -75.680382,
    items: [
      {
        name: "Smash sencilla",
        price: 20,
        description: "Carne aplastada, queso americano y cebolla caramelizada",
        customizations: ["Sin cebolla", "Sin pepinillos"],
        extras: [
          { name: "Queso extra", price: 3 },
          { name: "Tocineta", price: 4 },
        ],
      },
      {
        name: "Smash doble",
        price: 28,
        description: "Dos carnes aplastadas con doble queso",
        customizations: ["Sin cebolla", "Sin pepinillos"],
        extras: [
          { name: "Queso extra", price: 3 },
          { name: "Tocineta", price: 4 },
        ],
      },
      { name: "Papas criollas", price: 8 },
    ],
  },
  {
    name: "Horno Matecaña",
    category: "Pizza",
    spot: "Av. 30 de Agosto #75-51, Local C-37 (west)",
    latitude: 4.808922,
    longitude: -75.742761,
    items: [
      {
        name: "Pizza margarita mediana",
        price: 32,
        description: "Tomate, mozzarella y albahaca",
        customizations: ["Masa delgada"],
        extras: [
          { name: "Queso extra", price: 5 },
          { name: "Champiñones", price: 4 },
          { name: "Borde de queso", price: 7 },
        ],
      },
      {
        name: "Pizza hawaiana mediana",
        price: 35,
        description: "Jamón, piña y mozzarella",
        customizations: ["Masa delgada", "Sin piña"],
        extras: [
          { name: "Queso extra", price: 5 },
          { name: "Borde de queso", price: 7 },
        ],
      },
      {
        name: "Pizza de pepperoni mediana",
        price: 36,
        description: "Pepperoni y mozzarella",
        customizations: ["Masa delgada"],
        extras: [
          { name: "Queso extra", price: 5 },
          { name: "Champiñones", price: 4 },
          { name: "Borde de queso", price: 7 },
        ],
      },
      { name: "Pan de ajo", price: 9 },
    ],
  },
  {
    name: "Fonda El Otún",
    category: "Comida típica",
    spot: "Cl. 19 #6-43 (center)",
    latitude: 4.815130,
    longitude: -75.693644,
    items: [
      {
        name: "Bandeja paisa",
        price: 32,
        description: "Frijoles, arroz, carne molida, chicharrón, chorizo, huevo, arepa y aguacate",
        customizations: ["Sin chicharrón", "Sin aguacate"],
        extras: [
          { name: "Huevo frito", price: 3 },
          { name: "Chicharrón extra", price: 6 },
        ],
      },
      {
        name: "Sancocho de gallina",
        price: 26,
        description: "Con arroz, aguacate y arepa",
        customizations: ["Sin aguacate"],
        extras: [{ name: "Porción de arroz", price: 3 }],
      },
      {
        name: "Frijolada",
        price: 24,
        description: "Frijoles con arroz y chicharrón",
        customizations: ["Sin chicharrón"],
        extras: [{ name: "Chicharrón extra", price: 6 }],
      },
      { name: "Aguapanela con limón", price: 4 },
    ],
  },
  {
    name: "Arepas Doña Rosa",
    category: "Comida típica",
    spot: "Vía Pereira-Cerritos, 200 m before entrance 7 (far west)",
    latitude: 4.807021,
    longitude: -75.817498,
    items: [
      {
        name: "Arepa de chócolo con queso",
        price: 9,
        customizations: ["Sin mantequilla"],
        extras: [{ name: "Queso extra", price: 3 }],
      },
      {
        name: "Arepa rellena de carne",
        price: 12,
        extras: [
          { name: "Queso extra", price: 3 },
          { name: "Huevo frito", price: 3 },
        ],
      },
      {
        name: "Empanadas (4)",
        price: 8,
        description: "De carne y papa",
        extras: [{ name: "Ají casero", price: 1 }],
      },
      { name: "Jugo de lulo", price: 6, customizations: ["Sin azúcar"] },
    ],
  },
  {
    name: "El Pollo Cafetero",
    category: "Pollo",
    spot: "Cl. 14 #25-57 (center)",
    latitude: 4.798198,
    longitude: -75.690958,
    items: [
      {
        name: "Cuarto de pollo asado",
        price: 22,
        description: "Con papa salada y arepa",
        customizations: ["Sin salsas"],
        extras: [
          { name: "Salsa de ajo", price: 2 },
          { name: "Arepa adicional", price: 3 },
        ],
      },
      {
        name: "Medio pollo asado",
        price: 38,
        description: "Con papa salada y arepa",
        customizations: ["Sin salsas"],
        extras: [
          { name: "Salsa de ajo", price: 2 },
          { name: "Arepa adicional", price: 3 },
        ],
      },
      { name: "Alitas BBQ (8)", price: 26, extras: [{ name: "Salsa de ajo", price: 2 }] },
      { name: "Papas a la francesa", price: 8 },
    ],
  },
  {
    name: "Nori Sushi Bar",
    category: "Sushi",
    spot: "Cra. 16c #98-90 (west)",
    latitude: 4.809243,
    longitude: -75.760298,
    items: [
      {
        name: "Roll California",
        price: 28,
        description: "Cangrejo, aguacate y pepino",
        customizations: ["Sin ajonjolí"],
        extras: [
          { name: "Aguacate extra", price: 4 },
          { name: "Salsa de anguila", price: 3 },
        ],
      },
      {
        name: "Roll Philadelphia",
        price: 32,
        description: "Salmón y queso crema",
        customizations: ["Sin ajonjolí"],
        extras: [{ name: "Salsa de anguila", price: 3 }],
      },
      {
        name: "Roll tempura",
        price: 34,
        description: "Langostino apanado y aguacate",
        customizations: ["Sin ajonjolí"],
        extras: [
          { name: "Salsa de anguila", price: 3 },
          { name: "Aguacate extra", price: 4 },
        ],
      },
      { name: "Edamame", price: 12 },
    ],
  },
  {
    name: "Café La Ceiba",
    category: "Postres",
    spot: "Mirador Buenavida, V946+6X (far northeast)",
    latitude: 4.855729,
    longitude: -75.637267,
    items: [
      { name: "Torta de chocolate", price: 12, extras: [{ name: "Bola de helado", price: 4 }] },
      { name: "Cheesecake de maracuyá", price: 14 },
      {
        name: "Brownie con helado",
        price: 13,
        extras: [
          { name: "Bola de helado", price: 4 },
          { name: "Arequipe", price: 3 },
        ],
      },
      { name: "Café con leche", price: 6, customizations: ["Sin azúcar", "Leche deslactosada"] },
      { name: "Pandebono", price: 4 },
    ],
  },
];