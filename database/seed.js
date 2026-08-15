'use strict';

/**
 * CineBook AI — database seed script
 *
 * Seeds:
 *   - 66 movies (Hollywood / Bollywood / South Indian / International)
 *   - 8 theatres across 8 cities, 32 screens, 2,560 seats
 *   - ~900 shows across the next 7 days
 *   - a demo user (demo@cinebook.ai / Demo@1234) with sample bookings,
 *     so personalised recommendations work out of the box
 *
 * Run manually:      npm run seed
 * Run with reset:    node database/seed.js --force
 *
 * The server (Phase 2) will also call seedDatabase() automatically when
 * it starts with an empty database, so `npm install && npm start` works
 * with zero extra steps.
 */

const path = require('path');
const { randomUUID } = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./database');

/* ------------------------------------------------------------------ *
 *  Helpers
 * ------------------------------------------------------------------ */

const trailerUrl = (title) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} official trailer`)}`;

/**
 * Price breakdown used across the app (keep in sync with the booking
 * service and the frontend calculator):
 *   subtotal        = ticketPrice * seats
 *   convenienceFee  = 5% of subtotal
 *   gst             = 18% of (subtotal + convenienceFee)
 *   total           = subtotal + convenienceFee + gst
 */
function computePriceBreakdown(ticketPrice, seatCount) {
  const subtotal = Math.round(ticketPrice * seatCount * 100) / 100;
  const convenienceFee = Math.round(subtotal * 0.05 * 100) / 100;
  const gst = Math.round((subtotal + convenienceFee) * 0.18 * 100) / 100;
  const total = Math.round((subtotal + convenienceFee + gst) * 100) / 100;
  return { ticketPrice, seatCount, subtotal, convenienceFee, gst, total };
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function nextDates(days) {
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${day}`);
  }
  return out;
}

const makeRef = () =>
  `CB${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/* ------------------------------------------------------------------ *
 *  Movies
 *  genre / language / cast / keywords are comma-separated strings.
 * ------------------------------------------------------------------ */

const MOVIES = [
  {
    id: 'inception', title: 'Inception',
    description: 'A skilled thief who steals secrets from dreams is offered a chance to have his criminal history erased if he can plant an idea deep inside a target\'s subconscious.',
    genre: 'Sci-Fi, Thriller, Action', language: 'English', duration: 148, release_date: '2010-07-16',
    rating: 8.8, poster: 'https://upload.wikimedia.org/wikipedia/en/2/2e/Inception_%282010%29_theatrical_poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/s3TBrRGB1iav7gFOCNx3H31MoES.jpg',
    director: 'Christopher Nolan', cast: 'Leonardo DiCaprio, Joseph Gordon-Levitt, Elliot Page, Tom Hardy, Ken Watanabe',
    age_rating: 'UA 13+', popularity: 95, keywords: 'dream, heist, subconscious, time, mind-bending', status: 'now_showing'
  },
  {
    id: 'the-dark-knight', title: 'The Dark Knight',
    description: 'Batman faces his greatest challenge yet when the Joker plunges Gotham into chaos, forcing the Dark Knight to question everything he stands for.',
    genre: 'Action, Crime, Drama', language: 'English', duration: 152, release_date: '2008-07-18',
    rating: 9.0, poster: 'https://upload.wikimedia.org/wikipedia/en/1/1c/The_Dark_Knight_%282008_film%29.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/hkBaDkMWbLaf8B1lsWsKX7Ew3Xq.jpg',
    director: 'Christopher Nolan', cast: 'Christian Bale, Heath Ledger, Aaron Eckhart, Gary Oldman, Michael Caine',
    age_rating: 'UA 13+', popularity: 96, keywords: 'batman, joker, gotham, crime, vigilante', status: 'now_showing'
  },
  {
    id: 'interstellar', title: 'Interstellar',
    description: 'With Earth becoming uninhabitable, a team of explorers travels through a wormhole in search of a new home for humanity.',
    genre: 'Sci-Fi, Drama, Adventure', language: 'English', duration: 169, release_date: '2014-11-07',
    rating: 8.7, poster: 'https://upload.wikimedia.org/wikipedia/en/b/bc/Interstellar_film_poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/xJHokMbljvjADYdit5fK5VQsXEG.jpg',
    director: 'Christopher Nolan', cast: 'Matthew McConaughey, Anne Hathaway, Jessica Chastain, Michael Caine',
    age_rating: 'UA 13+', popularity: 94, keywords: 'space, black hole, time travel, survival, family', status: 'now_showing'
  },
  {
    id: 'oppenheimer', title: 'Oppenheimer',
    description: 'The story of J. Robert Oppenheimer and the Manhattan Project, tracing the creation of the atomic bomb and its devastating moral fallout.',
    genre: 'Biography, Drama, History', language: 'English', duration: 180, release_date: '2023-07-21',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/4/4a/Oppenheimer_%28film%29.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
    director: 'Christopher Nolan', cast: 'Cillian Murphy, Emily Blunt, Robert Downey Jr., Matt Damon, Florence Pugh',
    age_rating: 'A', popularity: 92, keywords: 'atomic bomb, scientist, war, history, moral dilemma', status: 'now_showing'
  },
  {
    id: 'dune-part-two', title: 'Dune: Part Two',
    description: 'Paul Atreides unites with the Fremen to wage war against House Harkonnen while confronting a destiny that could engulf the universe.',
    genre: 'Sci-Fi, Adventure, Drama', language: 'English', duration: 166, release_date: '2024-03-01',
    rating: 8.5, poster: 'https://upload.wikimedia.org/wikipedia/en/5/52/Dune_Part_Two_poster.jpeg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg',
    director: 'Denis Villeneuve', cast: 'Timothée Chalamet, Zendaya, Rebecca Ferguson, Austin Butler, Javier Bardem',
    age_rating: 'UA 13+', popularity: 93, keywords: 'desert planet, prophecy, epic, sandworm, rebellion', status: 'now_showing'
  },
  {
    id: 'avatar', title: 'Avatar',
    description: 'A paraplegic Marine dispatched to the moon Pandora becomes torn between following orders and protecting the world he feels is his home.',
    genre: 'Sci-Fi, Adventure, Action', language: 'English', duration: 162, release_date: '2009-12-18',
    rating: 7.9, poster: 'https://upload.wikimedia.org/wikipedia/en/d/d6/Avatar_%282009_film%29_poster.jpg',
    backdrop: null,
    director: 'James Cameron', cast: 'Sam Worthington, Zoe Saldana, Sigourney Weaver, Stephen Lang',
    age_rating: 'UA 13+', popularity: 90, keywords: 'alien world, pandora, nature, war, 3d', status: 'now_showing'
  },
  {
    id: 'avatar-way-of-water', title: 'Avatar: The Way of Water',
    description: 'Jake Sully and Neytiri must fight to protect their family when an ancient threat resurfaces on Pandora, driving them to the oceans.',
    genre: 'Sci-Fi, Adventure, Action', language: 'English', duration: 192, release_date: '2022-12-16',
    rating: 7.6, poster: 'https://upload.wikimedia.org/wikipedia/en/5/54/Avatar_The_Way_of_Water_poster.jpg',
    backdrop: null,
    director: 'James Cameron', cast: 'Sam Worthington, Zoe Saldana, Kate Winslet, Sigourney Weaver',
    age_rating: 'UA 13+', popularity: 88, keywords: 'pandora, ocean, family, na vi, sequel', status: 'now_showing'
  },
  {
    id: 'avengers-endgame', title: 'Avengers: Endgame',
    description: 'The surviving Avengers assemble one last time to reverse Thanos\' devastation and restore balance to the universe.',
    genre: 'Action, Sci-Fi, Adventure', language: 'English', duration: 181, release_date: '2019-04-26',
    rating: 8.4, poster: 'https://upload.wikimedia.org/wikipedia/en/0/0d/Avengers_Endgame_poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/7RyHsO4yDXtBv1zUU3mTpHeQ0d5.jpg',
    director: 'Anthony Russo, Joe Russo', cast: 'Robert Downey Jr., Chris Evans, Scarlett Johansson, Mark Ruffalo, Chris Hemsworth',
    age_rating: 'UA 13+', popularity: 96, keywords: 'marvel, superhero, thanos, time travel, team up', status: 'now_showing'
  },
  {
    id: 'spider-man-no-way-home', title: 'Spider-Man: No Way Home',
    description: 'Peter Parker\'s identity is exposed, and a botched spell plunges him into the multiverse, pitting him against villains from other worlds.',
    genre: 'Action, Adventure, Fantasy', language: 'English', duration: 148, release_date: '2021-12-17',
    rating: 8.2, poster: 'https://upload.wikimedia.org/wikipedia/en/0/00/Spider-Man_No_Way_Home_poster.jpg',
    backdrop: null,
    director: 'Jon Watts', cast: 'Tom Holland, Zendaya, Benedict Cumberbatch, Andrew Garfield, Tobey Maguire',
    age_rating: 'UA 13+', popularity: 94, keywords: 'spider-man, multiverse, marvel, villain, cameo', status: 'now_showing'
  },
  {
    id: 'the-batman', title: 'The Batman',
    description: 'In his second year of fighting crime, Batman uncovers corruption in Gotham while pursuing the Riddler, a serial killer targeting the city\'s elite.',
    genre: 'Action, Crime, Mystery', language: 'English', duration: 176, release_date: '2022-03-04',
    rating: 7.8, poster: 'https://upload.wikimedia.org/wikipedia/en/f/ff/The_Batman_%28film%29_poster.jpg',
    backdrop: null,
    director: 'Matt Reeves', cast: 'Robert Pattinson, Zoë Kravitz, Paul Dano, Colin Farrell, Jeffrey Wright',
    age_rating: 'UA 13+', popularity: 91, keywords: 'batman, detective, noir, riddler, gotham', status: 'now_showing'
  },
  {
    id: 'joker', title: 'Joker',
    description: 'A failed comedian\'s descent into madness and nihilism sparks a violent movement in a decaying Gotham City.',
    genre: 'Crime, Drama, Thriller', language: 'English', duration: 122, release_date: '2019-10-04',
    rating: 8.4, poster: 'https://upload.wikimedia.org/wikipedia/en/e/e1/Joker_%282019_film%29_poster.jpg',
    backdrop: 'https://image.tmdb.org/t/p/w1280/n6bUvigpRFqSwmPp1m2YADdbRBc.jpg',
    director: 'Todd Phillips', cast: 'Joaquin Phoenix, Robert De Niro, Zazie Beetz, Frances Conroy',
    age_rating: 'A', popularity: 93, keywords: 'joker, villain, mental health, gotham, society', status: 'now_showing'
  },
  {
    id: 'parasite', title: 'Parasite',
    description: 'A poor family schemes its way into the household of a wealthy one, setting off an unpredictable chain of events.',
    genre: 'Thriller, Drama, Comedy', language: 'Korean', duration: 132, release_date: '2019-05-30',
    rating: 8.5, poster: 'https://upload.wikimedia.org/wikipedia/en/5/53/Parasite_%282019_film%29.png',
    backdrop: 'https://image.tmdb.org/t/p/w1280/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg',
    director: 'Bong Joon-ho', cast: 'Song Kang-ho, Choi Woo-shik, Park So-dam, Cho Yeo-jeong',
    age_rating: 'A', popularity: 92, keywords: 'class, inequality, thriller, oscar, family', status: 'now_showing'
  },
  {
    id: 'everything-everywhere', title: 'Everything Everywhere All at Once',
    description: 'A laundromat owner is swept into a multiversal adventure where she must channel her alternate selves to save existence.',
    genre: 'Sci-Fi, Comedy, Action', language: 'English', duration: 139, release_date: '2022-03-25',
    rating: 7.8, poster: 'https://upload.wikimedia.org/wikipedia/en/1/1e/Everything_Everywhere_All_at_Once.jpg',
    backdrop: null,
    director: 'Daniel Kwan, Daniel Scheinert', cast: 'Michelle Yeoh, Ke Huy Quan, Stephanie Hsu, Jamie Lee Curtis',
    age_rating: 'A', popularity: 89, keywords: 'multiverse, absurd, family, kung fu, oscar', status: 'now_showing'
  },
  {
    id: 'top-gun-maverick', title: 'Top Gun: Maverick',
    description: 'After decades of service, Maverick trains a new generation of pilots for a mission that demands the ultimate sacrifice.',
    genre: 'Action, Drama', language: 'English', duration: 130, release_date: '2022-05-27',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/1/13/Top_Gun_Maverick_Poster.jpg',
    backdrop: null,
    director: 'Joseph Kosinski', cast: 'Tom Cruise, Miles Teller, Jennifer Connelly, Jon Hamm',
    age_rating: 'UA 13+', popularity: 91, keywords: 'fighter jet, aviation, sequel, action, military', status: 'now_showing'
  },
  {
    id: 'john-wick-4', title: 'John Wick: Chapter 4',
    description: 'John Wick takes his fight against the High Table global, forging new alliances to defeat the organization once and for all.',
    genre: 'Action, Thriller, Crime', language: 'English', duration: 169, release_date: '2023-03-24',
    rating: 7.7, poster: 'https://upload.wikimedia.org/wikipedia/en/d/d0/John_Wick_-_Chapter_4_promotional_poster.jpg',
    backdrop: null,
    director: 'Chad Stahelski', cast: 'Keanu Reeves, Donnie Yen, Bill Skarsgård, Ian McShane, Laurence Fishburne',
    age_rating: 'A', popularity: 87, keywords: 'assassin, revenge, gun-fu, high table, neo-noir', status: 'now_showing'
  },
  {
    id: 'shawshank', title: 'The Shawshank Redemption',
    description: 'A banker wrongly sentenced to life in prison forms an unlikely friendship and clings to hope over decades behind bars.',
    genre: 'Drama', language: 'English', duration: 142, release_date: '1994-09-23',
    rating: 9.3, poster: 'https://upload.wikimedia.org/wikipedia/en/8/81/ShawshankRedemptionMoviePoster.jpg',
    backdrop: null,
    director: 'Frank Darabont', cast: 'Tim Robbins, Morgan Freeman, Bob Gunton, William Sadler',
    age_rating: 'A', popularity: 97, keywords: 'prison, hope, friendship, escape, classic', status: 'now_showing'
  },
  {
    id: 'godfather', title: 'The Godfather',
    description: 'The aging patriarch of an organized crime dynasty transfers control of his empire to his reluctant youngest son.',
    genre: 'Crime, Drama', language: 'English', duration: 175, release_date: '1972-03-24',
    rating: 9.2, poster: 'https://upload.wikimedia.org/wikipedia/en/1/1c/Godfather_ver1.jpg',
    backdrop: null,
    director: 'Francis Ford Coppola', cast: 'Marlon Brando, Al Pacino, James Caan, Diane Keaton, Robert Duvall',
    age_rating: 'A', popularity: 96, keywords: 'mafia, family, power, crime, classic', status: 'now_showing'
  },
  {
    id: 'pulp-fiction', title: 'Pulp Fiction',
    description: 'The lives of two mob hitmen, a boxer, and a pair of diner bandits intertwine in tales of violence and redemption.',
    genre: 'Crime, Drama', language: 'English', duration: 154, release_date: '1994-10-14',
    rating: 8.9, poster: 'https://upload.wikimedia.org/wikipedia/en/3/3b/Pulp_Fiction_%281994%29_poster.jpg',
    backdrop: null,
    director: 'Quentin Tarantino', cast: 'John Travolta, Samuel L. Jackson, Uma Thurman, Bruce Willis',
    age_rating: 'A', popularity: 95, keywords: 'non-linear, crime, cult, dialogue, tarantino', status: 'now_showing'
  },
  {
    id: 'gladiator-ii', title: 'Gladiator II',
    description: 'Years after Maximus, Lucius is forced into the Colosseum and must restore Rome\'s glory from within the empire.',
    genre: 'Action, Drama, History', language: 'English', duration: 148, release_date: '2024-11-22',
    rating: 6.7, poster: 'https://upload.wikimedia.org/wikipedia/en/0/04/Gladiator_II_%282024%29_poster.jpg',
    backdrop: null,
    director: 'Ridley Scott', cast: 'Paul Mescal, Pedro Pascal, Denzel Washington, Connie Nielsen',
    age_rating: 'A', popularity: 84, keywords: 'rome, colosseum, epic, sequel, revenge', status: 'now_showing'
  },
  {
    id: 'deadpool-wolverine', title: 'Deadpool & Wolverine',
    description: 'Deadpool teams up with a reluctant Wolverine across the multiverse to save his world — with maximum chaos.',
    genre: 'Action, Comedy, Sci-Fi', language: 'English', duration: 128, release_date: '2024-07-26',
    rating: 7.6, poster: 'https://upload.wikimedia.org/wikipedia/en/4/4c/Deadpool_%26_Wolverine_poster.jpg',
    backdrop: null,
    director: 'Shawn Levy', cast: 'Ryan Reynolds, Hugh Jackman, Emma Corrin, Matthew Macfadyen',
    age_rating: 'A', popularity: 90, keywords: 'deadpool, wolverine, multiverse, comedy, r-rated', status: 'now_showing'
  },
  {
    id: 'dangal', title: 'Dangal',
    description: 'A former wrestler trains his daughters against all odds, guiding them toward international wrestling glory.',
    genre: 'Drama, Sport, Biography', language: 'Hindi', duration: 161, release_date: '2016-12-23',
    rating: 8.3, poster: null, backdrop: null,
    director: 'Nitesh Tiwari', cast: 'Aamir Khan, Fatima Sana Shaikh, Sanya Malhotra, Sakshi Tanwar',
    age_rating: 'U', popularity: 88, keywords: 'wrestling, women, father, sports, biopic', status: 'now_showing'
  },
  {
    id: 'three-idiots', title: '3 Idiots',
    description: 'Two friends search for their long-lost college buddy who taught them to chase excellence, not success.',
    genre: 'Comedy, Drama', language: 'Hindi', duration: 170, release_date: '2009-12-25',
    rating: 8.4, poster: 'https://upload.wikimedia.org/wikipedia/en/d/df/3_idiots_poster.jpg', backdrop: null,
    director: 'Rajkumar Hirani', cast: 'Aamir Khan, R. Madhavan, Sharman Joshi, Kareena Kapoor, Boman Irani',
    age_rating: 'U', popularity: 92, keywords: 'college, friendship, comedy, education, campus', status: 'now_showing'
  },
  {
    id: 'sholay', title: 'Sholay',
    description: 'Two petty criminals are hired by a retired police officer to capture a ruthless dacoit terrorizing his village.',
    genre: 'Action, Drama, Adventure', language: 'Hindi', duration: 204, release_date: '1975-08-15',
    rating: 8.1, poster: 'https://upload.wikimedia.org/wikipedia/en/5/52/Sholay-poster.jpg', backdrop: null,
    director: 'Ramesh Sippy', cast: 'Dharmendra, Amitabh Bachchan, Sanjeev Kumar, Hema Malini, Amjad Khan',
    age_rating: 'U', popularity: 85, keywords: 'dacoit, friendship, classic, revenge, western', status: 'now_showing'
  },
  {
    id: 'ddlj', title: 'Dilwale Dulhania Le Jayenge',
    description: 'A young couple falls in love on a European trip, but winning her strict father\'s approval becomes the ultimate test.',
    genre: 'Romance, Drama', language: 'Hindi', duration: 189, release_date: '1995-10-20',
    rating: 8.0, poster: 'https://upload.wikimedia.org/wikipedia/en/8/80/Dilwale_Dulhania_Le_Jayenge_poster.jpg', backdrop: null,
    director: 'Aditya Chopra', cast: 'Shah Rukh Khan, Kajol, Amrish Puri, Farida Jalal',
    age_rating: 'U', popularity: 89, keywords: 'romance, family, classic, marriage, europe', status: 'now_showing'
  },
  {
    id: 'pk', title: 'PK',
    description: 'An alien stranded on Earth questions humanity\'s religions, exposing the absurdities of blind faith.',
    genre: 'Comedy, Drama, Fantasy', language: 'Hindi', duration: 153, release_date: '2014-12-19',
    rating: 8.1, poster: 'https://upload.wikimedia.org/wikipedia/en/c/c3/PK_poster.jpg', backdrop: null,
    director: 'Rajkumar Hirani', cast: 'Aamir Khan, Anushka Sharma, Sanjay Dutt, Sushant Singh Rajput',
    age_rating: 'UA 13+', popularity: 86, keywords: 'alien, religion, satire, comedy, faith', status: 'now_showing'
  },
  {
    id: 'gully-boy', title: 'Gully Boy',
    description: 'A street rapper from the slums of Mumbai rises against the odds to make his voice heard on the biggest stage.',
    genre: 'Drama, Music', language: 'Hindi', duration: 154, release_date: '2019-02-14',
    rating: 7.9, poster: 'https://upload.wikimedia.org/wikipedia/en/0/07/Gully_Boy_poster.jpg', backdrop: null,
    director: 'Zoya Akhtar', cast: 'Ranveer Singh, Alia Bhatt, Siddhant Chaturvedi, Vijay Raaz',
    age_rating: 'UA 13+', popularity: 83, keywords: 'rap, mumbai, music, dreams, underdog', status: 'now_showing'
  },
  {
    id: 'andhadhun', title: 'Andhadhun',
    description: 'A blind pianist becomes entangled in a murder, only to discover that nothing is quite what it seems.',
    genre: 'Thriller, Crime, Mystery', language: 'Hindi', duration: 139, release_date: '2018-10-05',
    rating: 8.2, poster: 'https://upload.wikimedia.org/wikipedia/en/4/47/Andhadhun_poster.jpg', backdrop: null,
    director: 'Sriram Raghavan', cast: 'Ayushmann Khurrana, Tabu, Radhika Apte, Anil Dhawan',
    age_rating: 'UA 13+', popularity: 87, keywords: 'blind, twist, murder, thriller, deception', status: 'now_showing'
  },
  {
    id: 'tumbbad', title: 'Tumbbad',
    description: 'A man\'s greed for a hidden treasure guarded by an ancient goddess consumes him across generations.',
    genre: 'Horror, Fantasy, Thriller', language: 'Hindi', duration: 104, release_date: '2018-10-12',
    rating: 8.2, poster: 'https://upload.wikimedia.org/wikipedia/en/4/41/Tumbbad_poster.jpg', backdrop: null,
    director: 'Rahi Anil Barve', cast: 'Sohum Shah, Mohd Samad, Jyoti Malshe, Anita Date',
    age_rating: 'A', popularity: 82, keywords: 'folklore, greed, horror, myth, atmospheric', status: 'now_showing'
  },
  {
    id: 'kgf-2', title: 'KGF: Chapter 2',
    description: 'Rocky rises from the mines to rule the gold mafia, clashing with the most feared gangster in the land.',
    genre: 'Action, Drama, Crime', language: 'Kannada', duration: 168, release_date: '2022-04-14',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/d/d0/K.G.F_Chapter_2.jpg', backdrop: null,
    director: 'Prashanth Neel', cast: 'Yash, Sanjay Dutt, Raveena Tandon, Srinidhi Shetty',
    age_rating: 'UA 13+', popularity: 90, keywords: 'gold, mafia, gangster, power, mass action', status: 'now_showing'
  },
  {
    id: 'jawan', title: 'Jawan',
    description: 'A vigilante and his team of women hijack a metro to right deep-rooted wrongs, with a personal vendetta at the core.',
    genre: 'Action, Thriller, Drama', language: 'Hindi', duration: 169, release_date: '2023-09-07',
    rating: 6.9, poster: 'https://upload.wikimedia.org/wikipedia/en/3/39/Jawan_film_poster.jpg', backdrop: null,
    director: 'Atlee', cast: 'Shah Rukh Khan, Nayanthara, Vijay Sethupathi, Deepika Padukone',
    age_rating: 'UA 13+', popularity: 86, keywords: 'vigilante, heist, srk, action, revenge', status: 'now_showing'
  },
  {
    id: 'pathaan', title: 'Pathaan',
    description: 'An exiled RAW agent returns to stop a rogue mercenary from unleashing a catastrophic strike on India.',
    genre: 'Action, Thriller, Adventure', language: 'Hindi', duration: 146, release_date: '2023-01-25',
    rating: 5.9, poster: 'https://upload.wikimedia.org/wikipedia/en/c/c3/Pathaan_film_poster.jpg', backdrop: null,
    director: 'Siddharth Anand', cast: 'Shah Rukh Khan, Deepika Padukone, John Abraham, Dimple Kapadia',
    age_rating: 'UA 13+', popularity: 84, keywords: 'spy, action, raw, espionage, thriller', status: 'now_showing'
  },
  {
    id: 'animal', title: 'Animal',
    description: 'A violent man\'s obsessive love for his father spirals into a bloody saga of revenge and family feuds.',
    genre: 'Action, Crime, Drama', language: 'Hindi', duration: 201, release_date: '2023-12-01',
    rating: 6.2, poster: 'https://upload.wikimedia.org/wikipedia/en/9/90/Animal_%282023_film%29_poster.jpg', backdrop: null,
    director: 'Sandeep Reddy Vanga', cast: 'Ranbir Kapoor, Anil Kapoor, Rashmika Mandanna, Bobby Deol',
    age_rating: 'A', popularity: 85, keywords: 'revenge, family, toxic, action, violence', status: 'now_showing'
  },
  {
    id: 'drishyam-2', title: 'Drishyam 2',
    description: 'Vijay\'s carefully buried past resurfaces seven years later, and he must outwit the police all over again.',
    genre: 'Thriller, Crime, Drama', language: 'Hindi', duration: 140, release_date: '2022-11-18',
    rating: 8.2, poster: 'https://upload.wikimedia.org/wikipedia/en/3/3f/Drishyam_2.jpg', backdrop: null,
    director: 'Abhishek Pathak', cast: 'Ajay Devgn, Tabu, Akshaye Khanna, Shriya Saran',
    age_rating: 'UA 13+', popularity: 84, keywords: 'thriller, suspense, family, police, sequel', status: 'now_showing'
  },
  {
    id: 'twelfth-fail', title: '12th Fail',
    description: 'An aspiring IPS officer from a small village battles poverty and repeated failures on his journey to success.',
    genre: 'Drama, Biography', language: 'Hindi', duration: 147, release_date: '2023-10-27',
    rating: 8.8, poster: 'https://upload.wikimedia.org/wikipedia/en/f/f2/12th_Fail_poster.jpeg', backdrop: null,
    director: 'Vidhu Vinod Chopra', cast: 'Vikrant Massey, Medha Shankar, Anant Joshi',
    age_rating: 'U', popularity: 86, keywords: 'inspiration, upsc, perseverance, biopic, underdog', status: 'now_showing'
  },
  {
    id: 'laapataa-ladies', title: 'Laapataa Ladies',
    description: 'Two young brides are accidentally swapped on a train, sparking a heartwarming comedy about identity and dreams.',
    genre: 'Comedy, Drama', language: 'Hindi', duration: 122, release_date: '2024-03-01',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/5/52/Laapataa_Ladies_poster.jpg', backdrop: null,
    director: 'Kiran Rao', cast: 'Nitanshi Goel, Pratibha Ranta, Sparsh Shrivastava, Ravi Kishan',
    age_rating: 'U', popularity: 82, keywords: 'comedy, women, village, identity, heartwarming', status: 'now_showing'
  },
  {
    id: 'baahubali-1', title: 'Baahubali: The Beginning',
    description: 'A young man raised in the mountains discovers his royal lineage and the treachery that exiled him.',
    genre: 'Action, Fantasy, Adventure', language: 'Telugu', duration: 159, release_date: '2015-07-10',
    rating: 8.0, poster: 'https://upload.wikimedia.org/wikipedia/en/5/5f/Baahubali_The_Beginning_poster.jpg', backdrop: null,
    director: 'S. S. Rajamouli', cast: 'Prabhas, Rana Daggubati, Anushka Shetty, Tamannaah, Ramya Krishnan',
    age_rating: 'UA 13+', popularity: 87, keywords: 'epic, kingdom, war, legend, waterfall', status: 'now_showing'
  },
  {
    id: 'baahubali-2', title: 'Baahubali 2: The Conclusion',
    description: 'The answer to why Kattappa killed Baahubali unfolds in an epic tale of loyalty, betrayal and war.',
    genre: 'Action, Fantasy, Drama', language: 'Telugu', duration: 167, release_date: '2017-04-28',
    rating: 8.2, poster: 'https://upload.wikimedia.org/wikipedia/en/9/93/Baahubali_2_The_Conclusion_poster.jpg', backdrop: null,
    director: 'S. S. Rajamouli', cast: 'Prabhas, Rana Daggubati, Anushka Shetty, Ramya Krishnan, Sathyaraj',
    age_rating: 'UA 13+', popularity: 89, keywords: 'epic, sequel, betrayal, war, kingdom', status: 'now_showing'
  },
  {
    id: 'rrr', title: 'RRR',
    description: 'Two legendary revolutionaries forge a friendship in 1920s India, unaware of the impossible forces pulling them apart.',
    genre: 'Action, Drama, History', language: 'Telugu', duration: 187, release_date: '2022-03-25',
    rating: 7.8, poster: 'https://upload.wikimedia.org/wikipedia/en/d/d7/RRR_Poster.jpg', backdrop: null,
    director: 'S. S. Rajamouli', cast: 'N. T. Rama Rao Jr., Ram Charan, Alia Bhatt, Ajay Devgn, Ray Stevenson',
    age_rating: 'UA 13+', popularity: 94, keywords: 'revolution, friendship, british, epic, oscar', status: 'now_showing'
  },
  {
    id: 'kantara', title: 'Kantara',
    description: 'A forest guard clashes with his own people over a sacred land, unlocking a divine reckoning.',
    genre: 'Action, Adventure, Drama', language: 'Kannada', duration: 148, release_date: '2022-09-30',
    rating: 8.1, poster: 'https://upload.wikimedia.org/wikipedia/en/8/84/Kantara_poster.jpeg', backdrop: null,
    director: 'Rishab Shetty', cast: 'Rishab Shetty, Sapthami Gowda, Kishore, Achyuth Kumar',
    age_rating: 'UA 13+', popularity: 85, keywords: 'folklore, forest, deity, culture, tradition', status: 'now_showing'
  },
  {
    id: 'vikram', title: 'Vikram',
    description: 'A black-ops squad\'s mission goes wrong, and a mysterious vigilante\'s identity threatens to upend everything.',
    genre: 'Action, Thriller, Crime', language: 'Tamil', duration: 175, release_date: '2022-06-03',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/9/93/Vikram_2022_poster.jpg', backdrop: null,
    director: 'Lokesh Kanagaraj', cast: 'Kamal Haasan, Vijay Sethupathi, Fahadh Faasil, Suriya',
    age_rating: 'A', popularity: 88, keywords: 'vigilante, drugs, black ops, thriller, lcu', status: 'now_showing'
  },
  {
    id: 'pushpa', title: 'Pushpa: The Rise',
    description: 'A labourer rises through the ranks of red sandalwood smuggling, defying both the police and his rivals.',
    genre: 'Action, Drama, Crime', language: 'Telugu', duration: 179, release_date: '2021-12-17',
    rating: 7.6, poster: 'https://upload.wikimedia.org/wikipedia/en/7/75/Pushpa_-_The_Rise_%282021_film%29.jpg', backdrop: null,
    director: 'Sukumar', cast: 'Allu Arjun, Rashmika Mandanna, Fahadh Faasil, Jagadeesh Prathap Bandari',
    age_rating: 'UA 13+', popularity: 86, keywords: 'smuggling, underdog, mass, forest, style', status: 'now_showing'
  },
  {
    id: 'pushpa-2', title: 'Pushpa 2: The Rule',
    description: 'Pushpa returns to defend his smuggling empire against enemies old and new, in a battle for survival and pride.',
    genre: 'Action, Drama, Crime', language: 'Telugu', duration: 200, release_date: '2024-12-05',
    rating: 7.0, poster: 'https://upload.wikimedia.org/wikipedia/en/1/11/Pushpa_2-_The_Rule.jpg', backdrop: null,
    director: 'Sukumar', cast: 'Allu Arjun, Rashmika Mandanna, Fahadh Faasil, Jagapathi Babu',
    age_rating: 'UA 13+', popularity: 88, keywords: 'smuggling, sequel, mass, rivalry, action', status: 'now_showing'
  },
  {
    id: 'leo', title: 'Leo',
    description: 'A mild-mannered café owner\'s violent past catches up with him, forcing him to confront who he really is.',
    genre: 'Action, Thriller, Drama', language: 'Tamil', duration: 164, release_date: '2023-10-19',
    rating: 7.1, poster: 'https://upload.wikimedia.org/wikipedia/en/7/75/Leo_%282023_Indian_film%29.jpg', backdrop: null,
    director: 'Lokesh Kanagaraj', cast: 'Vijay, Sanjay Dutt, Trisha, Arjun Sarja, Gautham Vasudev Menon',
    age_rating: 'UA 13+', popularity: 84, keywords: 'past, action, gangster, identity, lcu', status: 'now_showing'
  },
  {
    id: 'ponniyin-selvan', title: 'Ponniyin Selvan: I',
    description: 'The Chola empire\'s succession is thrown into turmoil as princes, spies and courtiers scheme for the throne.',
    genre: 'History, Drama, Action', language: 'Tamil', duration: 167, release_date: '2022-09-30',
    rating: 7.6, poster: 'https://upload.wikimedia.org/wikipedia/en/c/c3/Ponniyin_Selvan_I.jpg', backdrop: null,
    director: 'Mani Ratnam', cast: 'Vikram, Aishwarya Rai Bachchan, Jayam Ravi, Karthi, Trisha',
    age_rating: 'UA 13+', popularity: 82, keywords: 'historical, chola, epic, royalty, war', status: 'now_showing'
  },
  {
    id: 'salaar', title: 'Salaar: Part 1 – Ceasefire',
    description: 'An exiled prince and a loyal friend reunite in the lawless city of Khansaar, where old debts demand blood.',
    genre: 'Action, Drama, Thriller', language: 'Telugu', duration: 175, release_date: '2023-12-22',
    rating: 6.6, poster: 'https://upload.wikimedia.org/wikipedia/en/a/a6/Salaar_Part_1_%E2%80%93_Ceasefire.jpg', backdrop: null,
    director: 'Prashanth Neel', cast: 'Prabhas, Prithviraj Sukumaran, Shruti Haasan, Jagapathi Babu',
    age_rating: 'A', popularity: 83, keywords: 'gangster, friendship, dystopia, action, revenge', status: 'now_showing'
  },
  {
    id: 'jailer', title: 'Jailer',
    description: 'A retired jailer goes on a rampage when a dangerous gang targets his family, unearthing his brutal past.',
    genre: 'Action, Comedy, Crime', language: 'Tamil', duration: 168, release_date: '2023-08-10',
    rating: 7.1, poster: 'https://upload.wikimedia.org/wikipedia/en/c/cb/Jailer_2023_Tamil_film_poster.jpg', backdrop: null,
    director: 'Nelson Dilipkumar', cast: 'Rajinikanth, Mohanlal, Jackie Shroff, Tamannaah, Ramya Krishnan',
    age_rating: 'UA 13+', popularity: 85, keywords: 'revenge, action, comedy, family, rajini', status: 'now_showing'
  },
  {
    id: 'sita-ramam', title: 'Sita Ramam',
    description: 'A soldier and a princess fall in love through letters, but war and duty threaten to keep them apart.',
    genre: 'Romance, Drama', language: 'Telugu', duration: 163, release_date: '2022-08-05',
    rating: 8.5, poster: 'https://upload.wikimedia.org/wikipedia/en/1/1d/Sita_Ramam.jpg', backdrop: null,
    director: 'Hanu Raghavapudi', cast: 'Dulquer Salmaan, Mrunal Thakur, Rashmika Mandanna, Sumanth',
    age_rating: 'U', popularity: 80, keywords: 'romance, letters, war, army, vintage', status: 'now_showing'
  },
  {
    id: 'drishyam', title: 'Drishyam',
    description: 'A cable operator uses his wits and his love of cinema to shield his family from a police investigation.',
    genre: 'Thriller, Drama, Crime', language: 'Malayalam', duration: 160, release_date: '2013-12-19',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/9/9e/DrishyamMovie.jpg', backdrop: null,
    director: 'Jeethu Joseph', cast: 'Mohanlal, Meena, Ansiba Hassan, Asha Sharath',
    age_rating: 'U', popularity: 86, keywords: 'thriller, family, police, suspense, classic', status: 'now_showing'
  },
  {
    id: 'ninety-six', title: '96',
    description: 'Two former classmates reunite after years apart and revisit the bittersweet memories of their school romance.',
    genre: 'Romance, Drama', language: 'Tamil', duration: 158, release_date: '2018-10-04',
    rating: 8.5, poster: 'https://upload.wikimedia.org/wikipedia/en/c/c4/%2796_film_poster.jpg', backdrop: null,
    director: 'C. Prem Kumar', cast: 'Vijay Sethupathi, Trisha, Gouri Kishan, Devadarshini',
    age_rating: 'U', popularity: 81, keywords: 'nostalgia, romance, school, reunion, memories', status: 'now_showing'
  },
  {
    id: 'kumbalangi-nights', title: 'Kumbalangi Nights',
    description: 'Four brothers in a fractured family find healing when love and loyalty are tested in their coastal village.',
    genre: 'Drama, Comedy, Romance', language: 'Malayalam', duration: 135, release_date: '2019-02-07',
    rating: 8.5, poster: 'https://upload.wikimedia.org/wikipedia/en/9/98/Kumbalangi_Nights_poster.jpg', backdrop: null,
    director: 'Madhu C. Narayanan', cast: 'Soubin Shahir, Shane Nigam, Fahadh Faasil, Sreenath Bhasi',
    age_rating: 'UA 13+', popularity: 80, keywords: 'family, brothers, village, romance, healing', status: 'now_showing'
  },
  {
    id: 'aavesham', title: 'Aavesham',
    description: 'Three college students seek protection from a local gangster, only to discover their new guardian is utterly unhinged.',
    genre: 'Action, Comedy, Drama', language: 'Malayalam', duration: 155, release_date: '2024-04-11',
    rating: 7.9, poster: null, backdrop: null,
    director: 'Jithu Madhavan', cast: 'Fahadh Faasil, Sajin Gopu, Mithun Jai Shankar, Roshan Shanavas',
    age_rating: 'UA 13+', popularity: 81, keywords: 'gangster, comedy, college, friendship, fun', status: 'now_showing'
  },
  {
    id: 'manjummel-boys', title: 'Manjummel Boys',
    description: 'A group of friends on a cave trip face a nightmare when one of them falls into a deep, unreachable pit.',
    genre: 'Thriller, Drama, Adventure', language: 'Malayalam', duration: 135, release_date: '2024-02-22',
    rating: 8.2, poster: 'https://upload.wikimedia.org/wikipedia/en/9/99/Manjummel_Boys_poster.jpg', backdrop: null,
    director: 'Chidambaram', cast: 'Soubin Shahir, Sreenath Bhasi, Balu Varghese, Ganapathy',
    age_rating: 'UA 13+', popularity: 82, keywords: 'survival, friendship, cave, rescue, thriller', status: 'now_showing'
  },
  {
    id: 'spirited-away', title: 'Spirited Away',
    description: 'A young girl wanders into a world of spirits and must find courage to free her parents and return home.',
    genre: 'Animation, Fantasy, Adventure', language: 'Japanese', duration: 125, release_date: '2001-07-20',
    rating: 8.6, poster: 'https://upload.wikimedia.org/wikipedia/en/d/db/Spirited_Away_Japanese_poster.png', backdrop: null,
    director: 'Hayao Miyazaki', cast: 'Rumi Hiiragi, Miyu Irino, Mari Natsuki, Takashi Naito',
    age_rating: 'U', popularity: 91, keywords: 'anime, spirits, ghibli, fantasy, oscar', status: 'now_showing'
  },
  {
    id: 'your-name', title: 'Your Name',
    description: 'Two teenagers mysteriously swap bodies and must find each other across time to prevent a tragedy.',
    genre: 'Animation, Romance, Fantasy', language: 'Japanese', duration: 106, release_date: '2016-08-26',
    rating: 8.4, poster: 'https://upload.wikimedia.org/wikipedia/en/0/0b/Your_Name_poster.png', backdrop: null,
    director: 'Makoto Shinkai', cast: 'Ryunosuke Kamiki, Mone Kamishiraishi, Masami Nagasawa',
    age_rating: 'U', popularity: 89, keywords: 'anime, romance, body swap, time, comet', status: 'now_showing'
  },
  {
    id: 'amelie', title: 'Amélie',
    description: 'A shy Parisian waitress secretly orchestrates the happiness of those around her while neglecting her own.',
    genre: 'Romance, Comedy', language: 'French', duration: 122, release_date: '2001-04-25',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/5/53/Amelie_poster.jpg', backdrop: null,
    director: 'Jean-Pierre Jeunet', cast: 'Audrey Tautou, Mathieu Kassovitz, Rufus, Lorella Cravotta',
    age_rating: 'U', popularity: 87, keywords: 'whimsical, paris, romance, quirky, kindness', status: 'now_showing'
  },
  {
    id: 'oldboy', title: 'Oldboy',
    description: 'A man imprisoned for 15 years without explanation is freed and given days to uncover who destroyed him.',
    genre: 'Thriller, Mystery, Action', language: 'Korean', duration: 120, release_date: '2003-11-21',
    rating: 8.3, poster: 'https://upload.wikimedia.org/wikipedia/en/6/67/Oldboykoreanposter.jpg', backdrop: null,
    director: 'Park Chan-wook', cast: 'Choi Min-sik, Yoo Ji-tae, Kang Hye-jung, Ji Dae-han',
    age_rating: 'A', popularity: 86, keywords: 'revenge, twist, imprisonment, mystery, cult', status: 'now_showing'
  },
  {
    id: 'train-to-busan', title: 'Train to Busan',
    description: 'Passengers on a speeding train fight for survival as a zombie outbreak engulfs South Korea.',
    genre: 'Action, Horror, Thriller', language: 'Korean', duration: 118, release_date: '2016-07-20',
    rating: 7.6, poster: 'https://upload.wikimedia.org/wikipedia/en/9/95/Train_to_Busan.jpg', backdrop: null,
    director: 'Yeon Sang-ho', cast: 'Gong Yoo, Jung Yu-mi, Ma Dong-seok, Kim Su-an',
    age_rating: 'A', popularity: 84, keywords: 'zombie, train, survival, horror, korean', status: 'now_showing'
  },
  {
    id: 'city-of-god', title: 'City of God',
    description: 'Two boys growing up in a Rio favela take wildly different paths amid drugs, crime and violence.',
    genre: 'Crime, Drama', language: 'Portuguese', duration: 130, release_date: '2002-08-30',
    rating: 8.6, poster: 'https://upload.wikimedia.org/wikipedia/en/1/10/CidadedeDeus.jpg', backdrop: null,
    director: 'Fernando Meirelles, Kátia Lund', cast: 'Alexandre Rodrigues, Leandro Firmino, Phellipe Haagensen',
    age_rating: 'A', popularity: 90, keywords: 'favela, crime, coming of age, violence, brazil', status: 'now_showing'
  },
  {
    id: 'life-is-beautiful', title: 'Life Is Beautiful',
    description: 'A Jewish father uses imagination and humour to shield his young son from the horrors of a concentration camp.',
    genre: 'Drama, Comedy, War', language: 'Italian', duration: 116, release_date: '1997-12-20',
    rating: 8.6, poster: 'https://upload.wikimedia.org/wikipedia/en/7/7c/Vitaebella.jpg', backdrop: null,
    director: 'Roberto Benigni', cast: 'Roberto Benigni, Nicoletta Braschi, Giorgio Cantarini',
    age_rating: 'U', popularity: 88, keywords: 'holocaust, father, love, hope, classic', status: 'now_showing'
  },
  // ------------------------------------------------------------------
  // Coming soon (release_date is in the future relative to the seed date)
  // ------------------------------------------------------------------
  {
    id: 'the-batman-part-ii', title: 'The Batman: Part II',
    description: 'The Dark Knight returns as Gotham\'s corruption deepens and a new enemy emerges from the shadows.',
    genre: 'Action, Crime, Mystery', language: 'English', duration: 0, release_date: '2027-10-01',
    rating: 0, poster: 'https://upload.wikimedia.org/wikipedia/en/a/a7/The_Batman_Part_II_logo.png', backdrop: null,
    director: 'Matt Reeves', cast: 'Robert Pattinson, Zoë Kravitz, Jeffrey Wright, Andy Serkis',
    age_rating: 'UA 13+', popularity: 88, keywords: 'batman, gotham, sequel, detective, noir', status: 'coming_soon'
  },
  {
    id: 'dune-messiah', title: 'Dune: Messiah',
    description: 'Paul Atreides faces the consequences of his holy war as political and cosmic forces close in around him.',
    genre: 'Sci-Fi, Drama, Adventure', language: 'English', duration: 0, release_date: '2026-12-18',
    rating: 0, poster: null, backdrop: null,
    director: 'Denis Villeneuve', cast: 'Timothée Chalamet, Zendaya, Florence Pugh, Anya Taylor-Joy',
    age_rating: 'UA 13+', popularity: 90, keywords: 'dune, desert planet, sequel, prophecy, empire', status: 'coming_soon'
  },
  {
    id: 'avengers-secret-wars', title: 'Avengers: Secret Wars',
    description: 'Earth\'s mightiest heroes face their greatest battle yet as realities collide in the ultimate showdown.',
    genre: 'Action, Sci-Fi, Adventure', language: 'English', duration: 0, release_date: '2027-05-07',
    rating: 0, poster: null, backdrop: null,
    director: 'Anthony Russo, Joe Russo', cast: 'Robert Downey Jr., Chris Evans, Benedict Cumberbatch',
    age_rating: 'UA 13+', popularity: 92, keywords: 'marvel, multiverse, superhero, crossover, epic', status: 'coming_soon'
  },
  {
    id: 'don-3', title: 'Don 3',
    description: 'The legendary criminal mastermind resurfaces in a globe-trotting game of deception, heists and high-stakes revenge.',
    genre: 'Action, Thriller, Crime', language: 'Hindi', duration: 0, release_date: '2026-12-18',
    rating: 0, poster: null, backdrop: null,
    director: 'Farhan Akhtar', cast: 'Ranveer Singh, Kiara Advani, Vikrant Massey',
    age_rating: 'UA 13+', popularity: 86, keywords: 'heist, thriller, don, chase, undercover', status: 'coming_soon'
  },
  {
    id: 'brahmastra-dev', title: 'Brahmāstra Part Two: Dev',
    description: 'The Astraverse expands as Dev, the first wielder of the Brahmāstra, awakens to an ancient war of light and darkness.',
    genre: 'Action, Fantasy, Adventure', language: 'Hindi', duration: 0, release_date: '2026-09-30',
    rating: 0, poster: null, backdrop: null,
    director: 'Ayan Mukerji', cast: 'Ranbir Kapoor, Alia Bhatt, Amitabh Bachchan, Nagarjuna',
    age_rating: 'UA 13+', popularity: 85, keywords: 'astraverse, mythology, superpowers, sequel, epic', status: 'coming_soon'
  },
  {
    id: 'shrek-5', title: 'Shrek 5',
    description: 'Shrek, Donkey and the gang return for another chaotic fairy-tale adventure with the swamp family.',
    genre: 'Animation, Comedy, Family', language: 'English', duration: 0, release_date: '2026-12-23',
    rating: 0, poster: 'https://upload.wikimedia.org/wikipedia/en/b/b6/Shrek_5_film_poster.jpg', backdrop: null,
    director: 'Walt Dohrn', cast: 'Mike Myers, Eddie Murphy, Cameron Diaz, Zendaya',
    age_rating: 'U', popularity: 84, keywords: 'animation, fairy tale, comedy, family, sequel', status: 'coming_soon'
  },
  {
    id: 'beyond-spider-verse', title: 'Spider-Man: Beyond the Spider-Verse',
    description: 'Miles Morales embarks on his most dangerous journey yet across the Spider-Verse to save the people he loves.',
    genre: 'Animation, Action, Adventure', language: 'English', duration: 0, release_date: '2027-01-08',
    rating: 0, poster: 'https://upload.wikimedia.org/wikipedia/en/a/a0/Spider-Man_Beyond_the_Spider-Verse_logo.jpg', backdrop: null,
    director: 'Joaquim Dos Santos, Justin K. Thompson', cast: 'Shameik Moore, Hailee Steinfeld, Brian Tyree Henry',
    age_rating: 'U', popularity: 89, keywords: 'spider-verse, animation, multiverse, superhero, sequel', status: 'coming_soon'
  }
];

/* ------------------------------------------------------------------ *
 *  Theatres (city factor drives ticket-price tiers)
 * ------------------------------------------------------------------ */

const THEATRES = [
  { id: 'th-01', name: 'INOX Esplanade',        city: 'Bhubaneswar', address: 'Esplanade One Mall, Rasulgarh, Bhubaneswar, Odisha 751010',      screens: 4, factor: 0.95 },
  { id: 'th-02', name: 'Cinepolis Cuttack',     city: 'Cuttack',     address: 'Netaji Subhas Bose Road, Cuttack, Odisha 753001',                 screens: 3, factor: 0.90 },
  { id: 'th-03', name: 'PVR Phoenix Palladium', city: 'Mumbai',      address: 'Phoenix Palladium, Lower Parel, Mumbai, Maharashtra 400013',     screens: 5, factor: 1.30 },
  { id: 'th-04', name: 'INOX Select Citywalk',  city: 'Delhi',       address: 'Select Citywalk, Saket, New Delhi 110017',                         screens: 4, factor: 1.25 },
  { id: 'th-05', name: 'PVR Forum Mall',        city: 'Bengaluru',   address: 'Forum Mall, Koramangala, Bengaluru, Karnataka 560095',            screens: 5, factor: 1.20 },
  { id: 'th-06', name: 'AMB Cinemas',           city: 'Hyderabad',   address: 'Gachibowli, Hyderabad, Telangana 500032',                          screens: 4, factor: 1.15 },
  { id: 'th-07', name: 'Sathyam Cinemas',       city: 'Chennai',     address: 'Thiruvika Road, Royapettah, Chennai, Tamil Nadu 600014',          screens: 4, factor: 1.10 },
  { id: 'th-08', name: 'INOX South City',       city: 'Kolkata',     address: 'South City Mall, Prince Anwar Shah Road, Kolkata, West Bengal 700032', screens: 3, factor: 1.00 }
];

/* ------------------------------------------------------------------ *
 *  Layout / showtime constants
 * ------------------------------------------------------------------ */

const SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const SEAT_COLS = 10; // seats per row: A1..A10 ... H1..H10 => 80 seats/screen

const SLOTS = [
  { time: '10:00', add: 0 },
  { time: '14:00', add: 40 },
  { time: '18:00', add: 70 },
  { time: '21:45', add: 110 }
];

const DAYS_AHEAD = 7;

/* ------------------------------------------------------------------ *
 *  Seed function
 * ------------------------------------------------------------------ */

function seedDatabase(force = false) {
  const movieCount = db.prepare('SELECT COUNT(*) AS n FROM movies').get().n;
  if (movieCount > 0 && !force) {
    console.log(`[seed] Database already contains ${movieCount} movies — skipping (use --force to reseed).`);
    return { skipped: true };
  }

  console.log('[seed] Seeding database...');

  const seed = db.transaction(() => {
    // Clear in FK-safe order. User accounts are preserved across reseeds.
    db.exec(`
      DELETE FROM booking_seats;
      DELETE FROM bookings;
      DELETE FROM reviews;
      DELETE FROM user_preferences;
      DELETE FROM shows;
      DELETE FROM seats;
      DELETE FROM screens;
      DELETE FROM theatres;
      DELETE FROM movies;
    `);

    /* ---------------- Movies ---------------- */
    const insertMovie = db.prepare(`
      INSERT INTO movies (id, title, description, genre, language, duration, release_date,
                          rating, poster_url, backdrop_url, trailer_url, director, cast,
                          age_rating, popularity_score, keywords, status)
      VALUES (@id, @title, @description, @genre, @language, @duration, @release_date,
              @rating, @poster_url, @backdrop_url, @trailer_url, @director, @cast,
              @age_rating, @popularity_score, @keywords, @status)
    `);
    for (const m of MOVIES) {
      insertMovie.run({
        id: m.id,
        title: m.title,
        description: m.description,
        genre: m.genre,
        language: m.language,
        duration: m.duration,
        release_date: m.release_date,
        rating: m.rating,
        poster_url: m.poster || null,
        backdrop_url: m.backdrop || null,
        trailer_url: trailerUrl(m.title),
        director: m.director,
        cast: m.cast,
        age_rating: m.age_rating,
        popularity_score: m.popularity,
        keywords: m.keywords,
        status: m.status
      });
    }

    /* ---------------- Theatres + screens + seats ---------------- */
    const insertTheatre = db.prepare(`
      INSERT INTO theatres (id, name, city, address, screens)
      VALUES (@id, @name, @city, @address, @screens)
    `);
    const insertScreen = db.prepare(`
      INSERT INTO screens (id, theatre_id, screen_number, name, total_seats)
      VALUES (@id, @theatre_id, @screen_number, @name, @total_seats)
    `);
    const insertSeat = db.prepare(`
      INSERT INTO seats (id, screen_id, row_label, seat_number, seat_code, seat_type)
      VALUES (@id, @screen_id, @row_label, @seat_number, @seat_code, @seat_type)
    `);

    for (const t of THEATRES) {
      insertTheatre.run({ id: t.id, name: t.name, city: t.city, address: t.address, screens: t.screens });
      for (let n = 1; n <= t.screens; n += 1) {
        const screenId = `sc-${t.id}-${n}`;
        insertScreen.run({
          id: screenId,
          theatre_id: t.id,
          screen_number: n,
          name: `Screen ${n}`,
          total_seats: SEAT_ROWS.length * SEAT_COLS
        });
        for (const row of SEAT_ROWS) {
          for (let c = 1; c <= SEAT_COLS; c += 1) {
            insertSeat.run({
              id: `seat-${screenId}-${row}${c}`,
              screen_id: screenId,
              row_label: row,
              seat_number: c,
              seat_code: `${row}${c}`,
              // Middle rows are "premium" seats (visual tier, same price tier).
              seat_type: (row === 'C' || row === 'D') ? 'premium' : 'standard'
            });
          }
        }
      }
    }

    /* ---------------- Shows ---------------- */
    const insertShow = db.prepare(`
      INSERT INTO shows (id, movie_id, theatre_id, screen_id, show_date, start_time, end_time, ticket_price)
      VALUES (@id, @movie_id, @theatre_id, @screen_id, @show_date, @start_time, @end_time, @ticket_price)
    `);
    const nowShowing = MOVIES.filter((m) => m.status === 'now_showing');
    const dates = nextDates(DAYS_AHEAD);

    // A simple incrementing cursor guarantees EVERY now_showing movie gets
    // scheduled (a modular formula can skip indices when the modulus and
    // the step size are not coprime).
    let movieCursor = 0;

    THEATRES.forEach((t, ti) => {
      for (let n = 1; n <= t.screens; n += 1) {
        const screenId = `sc-${t.id}-${n}`;
        dates.forEach((date, di) => {
          SLOTS.forEach((slot, si) => {
            const movie = nowShowing[movieCursor % nowShowing.length];
            movieCursor += 1;
            const endTime = addMinutes(slot.time, movie.duration + 30);
            const price = Math.round((140 * t.factor + slot.add) / 10) * 10;
            insertShow.run({
              id: randomUUID(),
              movie_id: movie.id,
              theatre_id: t.id,
              screen_id: screenId,
              show_date: date,
              start_time: slot.time,
              end_time: endTime,
              ticket_price: price
            });
          });
        });
      }
    });

    /* ---------------- Demo user ---------------- */
    const demoEmail = 'demo@cinebook.ai';
    const passwordHash = bcrypt.hashSync('Demo@1234', 10);
    db.prepare(`
      INSERT OR IGNORE INTO users (id, name, email, password_hash)
      VALUES (@id, @name, @email, @password_hash)
    `).run({ id: randomUUID(), name: 'Demo User', email: demoEmail, password_hash: passwordHash });
    const demoUserId = db.prepare('SELECT id FROM users WHERE email = ?').get(demoEmail).id;

    /* ---------------- Demo bookings + reviews ---------------- */
    const insertBooking = db.prepare(`
      INSERT INTO bookings (id, user_id, show_id, booking_reference, total_amount, status, created_at)
      VALUES (@id, @user_id, @show_id, @booking_reference, @total_amount, 'confirmed', datetime('now'))
    `);
    const insertBookingSeat = db.prepare(`
      INSERT INTO booking_seats (id, booking_id, show_id, seat_id, price)
      VALUES (@id, @booking_id, @show_id, @seat_id, @price)
    `);
    const findShow = db.prepare(`
      SELECT id, movie_id, theatre_id, screen_id, show_date, start_time, end_time, ticket_price
      FROM shows WHERE movie_id = ? AND show_date >= ?
      ORDER BY show_date, start_time LIMIT 1
    `);
    const findSeats = db.prepare(`
      SELECT id, seat_code FROM seats WHERE screen_id = ? ORDER BY row_label, seat_number LIMIT ?
    `);

    const bookForDemo = (movieId, seatCount) => {
      const show = findShow.get(movieId, dates[0]);
      if (!show) return;
      const seats = findSeats.all(show.screen_id, seatCount);
      if (seats.length === 0) return;
      const breakdown = computePriceBreakdown(show.ticket_price, seats.length);
      const bookingId = randomUUID();
      insertBooking.run({
        id: bookingId,
        user_id: demoUserId,
        show_id: show.id,
        booking_reference: makeRef(),
        total_amount: breakdown.total
      });
      for (const s of seats) {
        insertBookingSeat.run({
          id: randomUUID(),
          booking_id: bookingId,
          show_id: show.id,
          seat_id: s.id,
          price: show.ticket_price
        });
      }
    };

    // Give the demo user a clear taste profile: English sci-fi/action + a Telugu epic.
    bookForDemo('inception', 2);
    bookForDemo('interstellar', 2);
    bookForDemo('the-dark-knight', 2);
    bookForDemo('rrr', 2);

    const insertReview = db.prepare(`
      INSERT INTO reviews (id, user_id, movie_id, rating, review_text, created_at)
      VALUES (@id, @user_id, @movie_id, @rating, @review_text, datetime('now'))
    `);
    insertReview.run({ id: randomUUID(), user_id: demoUserId, movie_id: 'inception', rating: 5, review_text: 'A mind-bending masterpiece. Every rewatch reveals something new.' });
    insertReview.run({ id: randomUUID(), user_id: demoUserId, movie_id: 'rrr', rating: 5, review_text: 'Pure adrenaline from start to finish. The interval block is unreal!' });
    insertReview.run({ id: randomUUID(), user_id: demoUserId, movie_id: 'interstellar', rating: 4, review_text: 'Visually stunning and deeply emotional. The docking scene is iconic.' });
  });

  seed();

  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  console.log('[seed] Done.');
  console.log(`[seed]   movies:      ${count('movies')}`);
  console.log(`[seed]   theatres:    ${count('theatres')}`);
  console.log(`[seed]   screens:     ${count('screens')}`);
  console.log(`[seed]   seats:       ${count('seats')}`);
  console.log(`[seed]   shows:       ${count('shows')}`);
  console.log(`[seed]   bookings:    ${count('bookings')}`);
  console.log(`[seed]   reviews:     ${count('reviews')}`);
  console.log('[seed]   Demo login:  demo@cinebook.ai / Demo@1234');

  return {
    movies: count('movies'),
    theatres: count('theatres'),
    screens: count('screens'),
    seats: count('seats'),
    shows: count('shows')
  };
}

module.exports = { seedDatabase };

/* Run directly: `npm run seed` / `node database/seed.js [--force]` */
if (require.main === module) {
  const force = process.argv.includes('--force');
  seedDatabase(force);
}
