import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

async function checkSchema() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
  });

  const tables = [
    'seating_allocations',
    'classroom_seats',
    'individual_seating_plans',
    'course_enrollments',
    'students',
    'scheduled_exams',
    'classrooms',
    'exam_slots',
    'courses',
    'course_instructors'
  ];

  for (const table of tables) {
    try {
      const [rows] = await connection.execute(`DESCRIBE ${table}`);
      console.log(`\n=== ${table} ===`);
      rows.forEach(r => console.log(`  ${r.Field.padEnd(25)} ${r.Type.padEnd(25)} ${r.Key.padEnd(5)} ${r.Default ?? 'NULL'}`));
    } catch (e) {
      console.log(`\n=== ${table} === NOT FOUND: ${e.message}`);
    }
  }

  // Sample data from key tables
  console.log('\n\n--- SAMPLE DATA ---');
  
  try {
    const [sa] = await connection.execute('SELECT * FROM seating_allocations LIMIT 3');
    console.log('\nseating_allocations sample:', JSON.stringify(sa, null, 2));
  } catch(e) { console.log('seating_allocations:', e.message); }

  try {
    const [cs] = await connection.execute('SELECT * FROM classroom_seats LIMIT 3');
    console.log('\nclassroom_seats sample:', JSON.stringify(cs, null, 2));
  } catch(e) { console.log('classroom_seats:', e.message); }

  try {
    const [isp] = await connection.execute('SELECT * FROM individual_seating_plans LIMIT 3');
    console.log('\nindividual_seating_plans sample:', JSON.stringify(isp, null, 2));
  } catch(e) { console.log('individual_seating_plans:', e.message); }

  try {
    const [ce] = await connection.execute('SELECT * FROM course_enrollments LIMIT 3');
    console.log('\ncourse_enrollments sample:', JSON.stringify(ce, null, 2));
  } catch(e) { console.log('course_enrollments:', e.message); }

  try {
    const [st] = await connection.execute('SELECT * FROM students LIMIT 3');
    console.log('\nstudents sample:', JSON.stringify(st, null, 2));
  } catch(e) { console.log('students:', e.message); }

  try {
    const [se] = await connection.execute('SELECT * FROM scheduled_exams LIMIT 3');
    console.log('\nscheduled_exams sample:', JSON.stringify(se, null, 2));
  } catch(e) { console.log('scheduled_exams:', e.message); }

  try {
    const [cl] = await connection.execute('SELECT * FROM classrooms LIMIT 3');
    console.log('\nclassrooms sample:', JSON.stringify(cl, null, 2));
  } catch(e) { console.log('classrooms:', e.message); }

  // Count records
  console.log('\n\n--- RECORD COUNTS ---');
  for (const table of tables) {
    try {
      const [rows] = await connection.execute(`SELECT COUNT(*) as cnt FROM ${table}`);
      console.log(`  ${table.padEnd(30)} ${rows[0].cnt} rows`);
    } catch(e) {
      console.log(`  ${table.padEnd(30)} TABLE NOT FOUND`);
    }
  }

  await connection.end();
}

checkSchema().catch(console.error);
