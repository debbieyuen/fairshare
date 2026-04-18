// Data for the Union prototype
const CONTACTS = [
  { id: 'capri', name: 'Capri Rosedale', relation: '18 years, 10 months', lastSeen: '28d ago', avatar: 'capri', recent: true, vouchedBy: 3, mutualGroups: 2 },
  { id: 'michael', name: 'Michael Birch', relation: '17 years, 3 months', lastSeen: '28d ago', avatar: null, vouchedBy: 7, mutualGroups: 3 },
  { id: 'lou', name: 'Lou de K', relation: '1 year, 3 months', lastSeen: '23d ago', avatar: null, vouchedBy: 1, mutualGroups: 1 },
  { id: 'chrissy', name: 'Chrissy', relation: '', lastSeen: '10d ago', avatar: null, vouchedBy: 0, mutualGroups: 0 },
  { id: 'ryan', name: 'Ryan Karpf', relation: '1 month', lastSeen: '17d ago', avatar: null, vouchedBy: 2, mutualGroups: 1 },
  { id: 'joscha', name: 'Joscha Bach', relation: '2 years, 5 months', lastSeen: 'Mar 18', avatar: null, vouchedBy: 4, mutualGroups: 2 },
  { id: 'emily', name: 'Emily Quiles', relation: '3 months', lastSeen: '16d ago', avatar: 'emily', vouchedBy: 2, mutualGroups: 1 },
  { id: 'timour', name: 'Timour', relation: '2 years, 1 month', lastSeen: '21d ago', avatar: null, vouchedBy: 1, mutualGroups: 1 },
];

// Contact detail — Capri
const CAPRI = {
  id: 'capri',
  name: 'Capri Rosedale',
  relation: '18 years, 10 months',
  metOn: 'June 2, 2007',
  lastSeen: '28d ago',
  avatar: 'capri',
  notifyIfNearby: true,
  shareLocation: true,
  trust: {
    sharedContacts: 12,
    sharedGroups: 3,
    mutualAttestations: 5,
    vouchedBy: ['Michael Birch', 'Lou de K', 'Joscha Bach', 'Emily Quiles', 'Timour'],
    score: 92,
  },
  selfies: [
    { id: 1, date: 'March 23, 2026', loc: 'San Francisco, California', tag: 'selfie-1' },
    { id: 2, date: 'March 21, 2026', loc: 'San Francisco, California', tag: 'selfie-2' },
    { id: 3, date: 'March 21, 2026', loc: 'San Francisco, California', tag: 'selfie-3' },
  ],
  history: [
    { id: 'h1', when: '2 days ago', kind: 'nearby', text: 'Nearby in Mission District' },
    { id: 'h2', when: '28 days ago', kind: 'selfie', text: 'New selfie together' },
    { id: 'h3', when: '2 months ago', kind: 'vouch', text: 'You vouched for Capri' },
    { id: 'h4', when: '5 months ago', kind: 'group', text: 'Added to Lindens group' },
  ],
};

window.CONTACTS = CONTACTS;
window.CAPRI = CAPRI;
