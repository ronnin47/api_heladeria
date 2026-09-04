const express = require('express');
const cors = require('cors');
const http = require('http');

const bodyParser = require('body-parser');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');



const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.use(express.json({ limit: '50mb' })); // para parsear JSON
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// Servir la carpeta uploads como pública
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


console.trace("🚨 server.js ejecutado");





//base de datos en SupaBase
const pool = new Pool({
    user: 'postgres',
    host: 'db.fhjdokgyapwizzowbyya.supabase.co',
    database: 'postgres',
    password: 'auL6VvSMuBCEvRYa',
    port: 5432,
    ssl: {
        rejectUnauthorized: false
    }
});



app.get('/', (req, res) => {
  res.send('Servidor funcionando y conectado a SupaBase.');
});


// Probar conexión al iniciar el servidor
pool.connect()
  .then(client => {
    return client
      .query('SELECT NOW()')
      .then(res => {
        console.log('✅ Conexión a la base de datos exitosa. Fecha actual:', res.rows[0].now);
        client.release();
      })
      .catch(err => {
        client.release();
        console.error('❌ Error al hacer la consulta inicial:', err.stack);
      });
  })
  .catch(err => {
    console.error('❌ No se pudo conectar a la base de datos:', err.stack);
  });

// Prueba conexión a la base de datos
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()'); // Consulta simple
    res.json({ now: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



//Endpoint 
app.get('/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM usuarios');

        res.json(result.rows);

    } catch (error) {
        console.error('❌ Error al obtener usuarios:', error);

        res.status(500).json({
            error: 'Error al obtener los usuarios'
        });
    }
});



/*

const consulta= async()=>{


  const response = await fetch('http://localhost:3000/usuarios');

const usuarios = await response.json();

console.log(usuarios);

}


consulta();
*/


app.listen(PORT, () => {
    console.log(`🟢 Servidor corriendo en puerto ${PORT}`);
});
