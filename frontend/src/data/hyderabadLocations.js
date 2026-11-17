// Comprehensive directory of Hyderabad localities, wards, landmarks, emergency centers, and police commands
export const HYDERABAD_LOCATIONS = [
  // ── 1. Published Waterlogging Hotspots (Pilot Priority) ──
  { name: 'Tolichowki Underpass', category: 'Hotspot', lat: 17.4003, lng: 78.4118, subText: 'HTP Waterlogging Point · Musi/Shaikpet basin' },
  { name: 'Lakdikapul Junction', category: 'Hotspot', lat: 17.4052, lng: 78.4633, subText: 'HTP Waterlogging Point · Central corridor' },
  { name: 'Begumpet Airport Road & Underpass', category: 'Hotspot', lat: 17.4447, lng: 78.4664, subText: 'HTP Waterlogging Point · Nala flood risk' },
  { name: 'Malakpet Ganj Underbridge', category: 'Hotspot', lat: 17.3732, lng: 78.4983, subText: 'HTP Waterlogging Point · Railway underbridge dip' },
  { name: 'Musi River Causeway (Chaderghat)', category: 'Hotspot', lat: 17.3754, lng: 78.4891, subText: 'HTP Waterlogging Point · River overflow risk' },
  { name: 'Secunderabad Station & Sangeet Jn', category: 'Hotspot', lat: 17.4399, lng: 78.4983, subText: 'HTP Waterlogging Point · Rail terminal hub' },

  // ── 2. Major Localities & GHMC Zones ──
  { name: 'Banjara Hills', category: 'Area', lat: 17.4156, lng: 78.4352, subText: 'Road No. 1–14, GHMC Khairatabad Circle' },
  { name: 'Jubilee Hills', category: 'Area', lat: 17.4319, lng: 78.4073, subText: 'Road No. 36/45, Check Post, Jubilee Hills' },
  { name: 'Gachibowli', category: 'Area', lat: 17.4401, lng: 78.3489, subText: 'ORR Junction, Stadium, IT Corridor' },
  { name: 'Hitec City', category: 'Area', lat: 17.4483, lng: 78.3814, subText: 'Cyber Towers, Mindspace, Madhapur' },
  { name: 'Madhapur', category: 'Area', lat: 17.4486, lng: 78.3908, subText: 'Ayyappa Society, 100 Feet Rd, Kavuri Hills' },
  { name: 'Kondapur', category: 'Area', lat: 17.4699, lng: 78.3578, subText: 'Botanical Garden Rd, Raghava Colony' },
  { name: 'Kukatpally', category: 'Area', lat: 17.4849, lng: 78.4138, subText: 'Y Junction, Metro, Kukatpally' },
  { name: 'KPHB Colony', category: 'Area', lat: 17.4932, lng: 78.3995, subText: 'Phase 1–9, JNTU, Kukatpally' },
  { name: 'Miyapur', category: 'Area', lat: 17.4968, lng: 78.3614, subText: 'Metro Depot, Allwyn X Roads, Miyapur' },
  { name: 'Nizampet', category: 'Area', lat: 17.5186, lng: 78.3844, subText: 'Nizampet Village, Bandari Layout' },
  { name: 'Chandanagar', category: 'Area', lat: 17.4912, lng: 78.3247, subText: 'National Highway 65, Serilingampally' },
  { name: 'Ameerpet', category: 'Area', lat: 17.4375, lng: 78.4482, subText: 'Commercial Hub, Metro interchange' },
  { name: 'SR Nagar (Sanjeeva Reddy Nagar)', category: 'Area', lat: 17.4428, lng: 78.4425, subText: 'Umesh Chandra Statue, Community Hall' },
  { name: 'Punjagutta', category: 'Area', lat: 17.4265, lng: 78.4519, subText: 'Central Mall, Flyover, Punjagutta' },
  { name: 'Somajiguda', category: 'Area', lat: 17.4237, lng: 78.4608, subText: 'Raj Bhavan Road, Somajiguda' },
  { name: 'Khairatabad', category: 'Area', lat: 17.4116, lng: 78.4619, subText: 'Khairatabad RTO, Ganesh Utsav, Metro' },
  { name: 'Nampally', category: 'Area', lat: 17.3924, lng: 78.4697, subText: 'Station, Exhibition Grounds, Nampally' },
  { name: 'Abids', category: 'Area', lat: 17.3892, lng: 78.4746, subText: 'Taj Mahal Hotel, GPO, Abids Road' },
  { name: 'Koti', category: 'Area', lat: 17.3833, lng: 78.4833, subText: 'Women\'s College, Sultan Bazar, Koti' },
  { name: 'Basheerbagh', category: 'Area', lat: 17.3994, lng: 78.4777, subText: 'Police Commissionerate, Babukhan Estate' },
  { name: 'Himayatnagar', category: 'Area', lat: 17.4028, lng: 78.4842, subText: 'Liberty, Urdu Hall, Himayatnagar' },
  { name: 'Narayanaguda', category: 'Area', lat: 17.3972, lng: 78.4906, subText: 'Flyover, YMCA, Narayanaguda' },
  { name: 'Barkatpura', category: 'Area', lat: 17.3931, lng: 78.4969, subText: 'Chaman, Bus Depot, Fever Hospital' },
  { name: 'Kachiguda', category: 'Area', lat: 17.3878, lng: 78.4986, subText: 'Railway Station, Tourist Hotel, Kachiguda' },
  { name: 'Musheerabad', category: 'Area', lat: 17.4167, lng: 78.5028, subText: 'Jail site, Bholakpur, Musheerabad' },
  { name: 'Chikkadpally', category: 'Area', lat: 17.4069, lng: 78.4958, subText: 'Tyagaraya Gana Sabha, Chikkadpally' },
  { name: 'RTC X Roads', category: 'Area', lat: 17.4089, lng: 78.4989, subText: 'Sandhya/Sudarshan Theatres, Crossroads' },
  { name: 'Dilsukhnagar', category: 'Area', lat: 17.3688, lng: 78.5247, subText: 'Bus Depot, Metro Station, Konark Jn' },
  { name: 'Kothapet', category: 'Area', lat: 17.3644, lng: 78.5414, subText: 'Fruit Market, Victoria Memorial Metro' },
  { name: 'LB Nagar', category: 'Area', lat: 17.3457, lng: 78.5522, subText: 'Ring Road Jn, Underpass, LB Nagar' },
  { name: 'Vanasthalipuram', category: 'Area', lat: 17.3325, lng: 78.5714, subText: 'Red Tank, Rythu Bazaar, Hayathnagar' },
  { name: 'Saroornagar', category: 'Area', lat: 17.3547, lng: 78.5369, subText: 'Saroornagar Lake, Priyadarshini Park' },
  { name: 'Santosh Nagar', category: 'Area', lat: 17.3486, lng: 78.5064, subText: 'IS Sadan, Yadagiri Theatre, DRDO' },
  { name: 'Chandrayangutta', category: 'Area', lat: 17.3225, lng: 78.4842, subText: 'Flyover, Barkas Road, Bandlaguda' },
  { name: 'Falaknuma', category: 'Area', lat: 17.3314, lng: 78.4681, subText: 'Palace, Railway Station, Engine Bowli' },
  { name: 'Charminar', category: 'Area', lat: 17.3616, lng: 78.4747, subText: 'Heritage Zone, Laad Bazaar, Mecca Masjid' },
  { name: 'Bahadurpura', category: 'Area', lat: 17.3564, lng: 78.4525, subText: 'Nehru Zoological Park, Bahadurpura PS' },
  { name: 'Mehdipatnam', category: 'Area', lat: 17.3917, lng: 78.4397, subText: 'Rythu Bazaar, PVNR Expressway Pillar 1–50' },
  { name: 'Attapur', category: 'Area', lat: 17.3703, lng: 78.4386, subText: 'PVNR Expressway Pillars, Hyderguda' },
  { name: 'Rajendranagar', category: 'Area', lat: 17.3197, lng: 78.4069, subText: 'Agriculture University, Budvel' },
  { name: 'Manikonda', category: 'Area', lat: 17.4042, lng: 78.3797, subText: 'Puppalguda, Lanco Hills, Secretariat Colony' },
  { name: 'Narsingi', category: 'Area', lat: 17.3811, lng: 78.3619, subText: 'ORR Tollgate, Gandipet Main Rd' },
  { name: 'Kokapet', category: 'Area', lat: 17.3931, lng: 78.3344, subText: 'Golden Mile, SEZ, Kokapet Lake' },
  { name: 'Financial District', category: 'Area', lat: 17.4167, lng: 78.3417, subText: 'Nanakramguda, Waverock, IT Hub' },
  { name: 'Secunderabad Paradise', category: 'Area', lat: 17.4414, lng: 78.4867, subText: 'Paradise Circle, MG Road, Secunderabad' },
  { name: 'Marredpally (West/East)', category: 'Area', lat: 17.4475, lng: 78.5086, subText: 'Shenoy Nursing Home, Keyes High School' },
  { name: 'Bowenpally', category: 'Area', lat: 17.4764, lng: 78.4886, subText: 'Hasmathpet, Military Dairy Farm, Checkpost' },
  { name: 'Alwal', category: 'Area', lat: 17.5036, lng: 78.5133, subText: 'IG Statue, Alwal Rythu Bazaar, Lothkunta' },
  { name: 'Trimulgherry', category: 'Area', lat: 17.4667, lng: 78.5167, subText: 'Cantonment, RTA Office, Crossroads' },
  { name: 'Karkhana', category: 'Area', lat: 17.4583, lng: 78.5028, subText: 'Vikrampuri, Police Station, Karkhana' },
  { name: 'AS Rao Nagar', category: 'Area', lat: 17.4839, lng: 78.5522, subText: 'Sainikpuri, Radhika Theatre, ECIL' },
  { name: 'ECIL Crossroads', category: 'Area', lat: 17.4722, lng: 78.5667, subText: 'Electronics Complex, Kushaiguda, Moula Ali' },
  { name: 'Malkajgiri', category: 'Area', lat: 17.4489, lng: 78.5319, subText: 'Anandbagh, Vani Nagar, Geetha Theatre' },
  { name: 'Nacharam', category: 'Area', lat: 17.4267, lng: 78.5614, subText: 'Industrial Area, HMT Nagar, Mallapur' },
  { name: 'Habsiguda', category: 'Area', lat: 17.4139, lng: 78.5447, subText: 'NGRI, Street No. 8, Metro Station' },
  { name: 'Tarnaka', category: 'Area', lat: 17.4289, lng: 78.5314, subText: 'Flyover, Aradhana Theatre, OU Gate' },
  { name: 'Osmania University Campus', category: 'Area', lat: 17.4144, lng: 78.5286, subText: 'Arts College, NCC Gate, University Road' },
  { name: 'Uppal', category: 'Area', lat: 17.4019, lng: 78.5603, subText: 'Rajiv Gandhi Stadium, Ring Road, Metro' },
  { name: 'Nagole', category: 'Area', lat: 17.3758, lng: 78.5683, subText: 'Metro Depot, Anand Nagar, Musi Bridge' },
  { name: 'Ramanthapur', category: 'Area', lat: 17.3917, lng: 78.5369, subText: 'TV Studio, Polytechnic College, Amberpet Rd' },
  { name: 'Amberpet', category: 'Area', lat: 17.3967, lng: 78.5178, subText: 'Ali Cafe, 6 Number Jn, Gandhi Statue' },
  { name: 'Afzalgunj', category: 'Area', lat: 17.3775, lng: 78.4792, subText: 'State Central Library, Nayapul, Osmania' },
  { name: 'Moosarambagh', category: 'Area', lat: 17.3769, lng: 78.5139, subText: 'Musi Bridge, Metro Station, Saleem Nagar' },
  { name: 'Shamshabad', category: 'Area', lat: 17.2514, lng: 78.4289, subText: 'RGIA Airport, Bangalore Highway NH 44' },
  { name: 'Aramghar', category: 'Area', lat: 17.3236, lng: 78.4378, subText: 'National Highway 44 Junction, Shivrampally' },

  // ── 3. Hospitals & Emergency Relief Centers ──
  { name: 'Osmania General Hospital', category: 'Hospital', lat: 17.3778, lng: 78.4764, subText: 'Emergency Trauma Care · Afzalgunj' },
  { name: 'Gandhi Hospital', category: 'Hospital', lat: 17.4239, lng: 78.5039, subText: 'Super Specialty Emergency · Musheerabad' },
  { name: 'NIMS (Nizam\'s Institute)', category: 'Hospital', lat: 17.4233, lng: 78.4533, subText: 'Autonomous Medical Institute · Punjagutta' },
  { name: 'Niloufer Hospital', category: 'Hospital', lat: 17.3969, lng: 78.4636, subText: 'Pediatric & Maternity Emergency · Red Hills' },
  { name: 'Care Hospital Banjara Hills', category: 'Hospital', lat: 17.4147, lng: 78.4464, subText: 'Road No. 1, Banjara Hills' },
  { name: 'Apollo Hospitals Jubilee Hills', category: 'Hospital', lat: 17.4264, lng: 78.4117, subText: 'Health City, Road No. 72, Jubilee Hills' },
  { name: 'Yashoda Hospital Malakpet', category: 'Hospital', lat: 17.3719, lng: 78.5036, subText: 'Emergency Center · Nalgonda X Roads' },
  { name: 'Yashoda Hospital Somajiguda', category: 'Hospital', lat: 17.4217, lng: 78.4589, subText: 'Emergency Care · Raj Bhavan Road' },
  { name: 'KIMS Hospital Secunderabad', category: 'Hospital', lat: 17.4361, lng: 78.4897, subText: 'Minister Road, Secunderabad' },
  { name: 'AIG Hospitals Gachibowli', category: 'Hospital', lat: 17.4439, lng: 78.3664, subText: 'Mindspace Road, Gachibowli' },
  { name: 'Continental Hospital', category: 'Hospital', lat: 17.4214, lng: 78.3444, subText: 'Financial District, Nanakramguda' },

  // ── 4. Police Commands & Control Stations ──
  { name: 'Hyderabad Police Commissionerate (Basheerbagh)', category: 'Police', lat: 17.3994, lng: 78.4777, subText: 'Central Police Command & Control Room' },
  { name: 'Integrated Command and Control Centre (ICCC)', category: 'Police', lat: 17.4189, lng: 78.4419, subText: 'Telangana Police ICCC · Road No. 12 Banjara Hills' },
  { name: 'Cyberabad Police Commissionerate', category: 'Police', lat: 17.4339, lng: 78.3714, subText: 'Gachibowli command center' },
  { name: 'Rachakonda Police Commissionerate', category: 'Police', lat: 17.4697, lng: 78.5344, subText: 'Neredmet command center' },
  { name: 'Banjara Hills Police Station', category: 'Police', lat: 17.4172, lng: 78.4483, subText: 'Road No. 12 Banjara Hills' },
  { name: 'Panjagutta Police Station', category: 'Police', lat: 17.4278, lng: 78.4528, subText: 'Central Zone Station' },
  { name: 'Madhapur Police Station', category: 'Police', lat: 17.4478, lng: 78.3889, subText: 'Cyberabad West Zone' },
  { name: 'Charminar Police Station', category: 'Police', lat: 17.3622, lng: 78.4739, subText: 'South Zone Command' },

  // ── 5. Water Bodies & Basins ──
  { name: 'Hussain Sagar Lake', category: 'Water Body', lat: 17.4239, lng: 78.4739, subText: 'Tank Bund, Necklace Road, Buddha Statue' },
  { name: 'Osman Sagar (Gandipet)', category: 'Water Body', lat: 17.3833, lng: 78.2917, subText: 'Reservoir & Dam Gates, Gandipet' },
  { name: 'Himayat Sagar', category: 'Water Body', lat: 17.3167, lng: 78.3583, subText: 'Reservoir & Flood Outlet, Rajendranagar' },
  { name: 'Mir Alam Tank', category: 'Water Body', lat: 17.3500, lng: 78.4417, subText: 'Multi-arch Dam, Bahadurpura/Zoo' },
  { name: 'Durgam Cheruvu', category: 'Water Body', lat: 17.4333, lng: 78.3833, subText: 'Cable Bridge, Madhapur/Hitec City' }
];

// High-speed search helper supporting multiple space-separated tokens, prefixes, and categories
export function searchHyderabadLocations(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored = [];
  for (const loc of HYDERABAD_LOCATIONS) {
    const nameLower = loc.name.toLowerCase();
    const subLower = (loc.subText || '').toLowerCase();
    const catLower = loc.category.toLowerCase();
    const combined = `${nameLower} ${subLower} ${catLower}`;

    // All tokens must match somewhere in the location record
    const allTokensMatch = tokens.every(token => combined.includes(token));
    if (!allTokensMatch) continue;

    // Score priority: exact match > name starts with query > name contains query > subtext contains
    let score = 0;
    if (nameLower === q) score += 100;
    else if (nameLower.startsWith(q)) score += 50;
    else if (nameLower.includes(q)) score += 30;
    else score += 10;

    if (loc.category === 'Hotspot') score += 15;
    else if (loc.category === 'Hospital' || loc.category === 'Police') score += 10;

    scored.push({ loc, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map(s => s.loc);
}
