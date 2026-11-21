/**
 * Word pools for generated names (brands, products, customers). Locale-specific so a
 * translation can provide its own flavor. Brands are invented jokes, never real companies.
 */
export const namesEn = {
  brands: [
    "Thockwell", "Clackington & Sons", "KeyKrafters", "Lubricus", "Switchy McSwitchface", "Domeless Co.",
    "Stemworks", "Keyzilla", "Capsmith", "Thockstar", "PBTea", "Springfield Switchworks", "Clickety Split",
    "Ctrl+Alt+Delight", "Shift Happens", "Esc Artists", "Keymancer", "Plonk Labs", "Chonk Industries",
    "Big Thock Energy", "Keeb Cartel", "Mushy Boi", "Sir Clacksalot", "Tactile Tortoise",
  ],
  switchAdj: [
    "Silky", "Midnight", "Turbo", "Lazy", "Angry", "Velvet", "Cosmic", "Chonky", "Smol", "Spicy", "Frosty",
    "Golden", "Nebula", "Retro", "Sleepy", "Buttery", "Hyper", "Crispy", "Moody", "Royal", "Sneaky", "Thicc",
  ],
  switchNoun: [
    "Creamsicle", "Marshmallow", "Yak", "Butter", "Latte", "Panda", "Ink", "Jade", "Tangerine", "Badger",
    "Mochi", "Boba", "Lava", "Glacier", "Cloud", "Snail", "Owl", "Pudding", "Waffle", "Gravy", "Pebble",
    "Thunder", "Pickle", "Noodle", "Walrus", "Toast", "Kiwi",
  ],
  setAdj: {
    pastel: ["Dreamy", "Cotton", "Soft", "Fluffy", "Milky", "Sleepy"],
    retro: ["Vintage", "Grandpa's", "Retro", "Office", "Terminal", "Beige Age"],
    dark: ["Midnight", "Shadow", "Noir", "Void", "After Hours", "Stealth"],
    mono: ["Total", "Pure", "Mono", "Solid", "Full", "Deep"],
    vivid: ["Electric", "Neon", "Turbo", "Hyper", "Loud", "Arcade"],
  },
  setNoun: {
    red: ["Cherry Soda", "Lava", "Ketchup", "Fire Truck"],
    orange: ["Tangerine", "Sunset", "Pumpkin", "Traffic Cone"],
    yellow: ["Lemon", "Banana", "Honey", "Rubber Duck"],
    green: ["Matcha", "Pickle", "Forest", "Frog"],
    teal: ["Lagoon", "Mint Tea", "Seafoam", "Pool Party"],
    blue: ["Ocean", "Glacier", "Denim", "Blueberry"],
    purple: ["Grape", "Lavender", "Galaxy", "Wizard"],
    pink: ["Sakura", "Bubblegum", "Flamingo", "Strawberry Milk"],
    beige: ["Oat Milk", "Sand", "Biscuit", "Latte"],
    white: ["Snow", "Cloud", "Milk", "Porcelain"],
    black: ["Ink", "Coal", "Night", "Espresso"],
    grey: ["Concrete", "Pigeon", "Fog", "Battleship"],
  },
  firstNames: [
    "Alex", "Sam", "Jordan", "Taylor", "Riley", "Casey", "Morgan", "Jamie", "Avery", "Quinn", "Kai", "Noah",
    "Mia", "Leo", "Zoe", "Omar", "Priya", "Hiro", "Lucia", "Mateo", "Ines", "Bjorn", "Fatima", "Chen",
    "Ana", "Dmitri", "Grace", "Tomas", "Yuki", "Rafael", "Nora", "Sven", "Amara", "Diego", "Ivy", "Felix",
    "Beatriz", "Kwame", "Lena", "Marco", "Sofia", "Theo", "Uma", "Victor", "Wren", "Xavier", "Yara", "Zane",
  ],
  lastNames: [
    "Keys", "Stroke", "Clickman", "Thompson", "Silva", "Nakamura", "Okafor", "Kowalski", "Garcia", "Novak",
    "Haddad", "Lindqvist", "Moreau", "Rossi", "Park", "Santos", "Fischer", "Ivanova", "Mendes", "O'Brien",
    "Tanaka", "Costa", "Dubois", "Ahmed", "Larsen", "Petrov", "Reyes", "Schmidt", "Walsh", "Yilmaz",
  ],
  handles: ["xX_ThockLord_Xx", "lubed_and_confused", "keeb_gremlin", "clack_attack", "spacebar_enjoyer", "RGB_or_die", "tactile_tony", "the_real_fn_key"],
};
export type NamePools = typeof namesEn;
