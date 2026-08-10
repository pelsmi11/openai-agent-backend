import { createPersonalInfo } from '../src/feature/admin/admin.service.js';
import { pgPool } from '../src/lib/pg/client.js';

const CRITICAL_PROFILE_EVIDENCE = [
  {
    category: 'experiencia',
    content:
      'Historial laboral documentado de Héctor Martínez: Programador Sénior en el Ministerio Público de Guatemala desde marzo de 2025; Analista Programador Full-Stack en Fundación Génesis Empresarial de marzo de 2022 a marzo de 2025; e Ingeniero de Bases de Datos en Justice Education Society de agosto de 2021 a marzo de 2022.',
  },
  {
    category: 'experiencia',
    content:
      'En Justice Education Society, Héctor Martínez diseñó e implementó soluciones de bases de datos para el Ministerio Público, desarrolló un nuevo Data Warehouse, lideró proyectos ETL y realizó migración y optimización de bases de datos.',
  },
  {
    category: 'experiencia',
    content:
      'Experiencia demostrada de Héctor Martínez con React y Node.js: en el Ministerio Público desarrolla funcionalidades frontend con React y backend con Node.js para el sistema de denuncias dentro de una arquitectura de microservicios con CI/CD; en Fundación Génesis Empresarial lideró soluciones frontend con React y desarrolló backend con Node.js.',
  },
] as const;

async function seed() {
  for (const entry of CRITICAL_PROFILE_EVIDENCE) {
    const existing = await pgPool.query(
      'SELECT id FROM personal_info WHERE category = $1 AND content = $2 LIMIT 1',
      [entry.category, entry.content],
    );
    if (existing.rowCount) {
      console.log(`[seed:critical-evidence] exists ${existing.rows[0].id}`);
      continue;
    }

    const created = await createPersonalInfo(entry.content, entry.category);
    console.log(`[seed:critical-evidence] created ${created.id}`);
  }
}

try {
  await seed();
} finally {
  await pgPool.end();
}
