const express = require('express');
const cors = require('cors');
const http = require('http');

const bodyParser = require('body-parser');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();


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
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
    ssl: {
        rejectUnauthorized: false
    }
});

module.exports = pool;

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


// Endpoint de login
app.post('/login', async (req, res) => {
    try {
        const { email, pass } = req.body;

        if (!email || !pass) {
            return res.status(400).json({
                error: 'Email y contraseña son obligatorios'
            });
        }

        const result = await pool.query(
            'SELECT * FROM usuarios WHERE email = $1 AND pass = $2',
            [email, pass]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: 'Email o contraseña incorrectos'
            });
        }

        const usuario = result.rows[0];

        res.json({
            login: true,
            usuario: usuario
        });

    } catch (error) {
        console.error('❌ Error en login:', error);

        res.status(500).json({
            error: 'Error interno del servidor'
        });
    }
});

// Endpoint para obtener todos los productos
app.get('/productos', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM productos ORDER BY id_producto ASC');

        res.json(result.rows);

    } catch (error) {
        console.error('❌ Error al obtener productos:', error);

        res.status(500).json({
            error: 'Error al obtener los productos'
        });
    }
});








//MI PARTE HECHA POR MI CUENTA(BRIAN), CUIDAOOOO!!!!


//endpoint para obtener pedidos activos
/*app.get('/pedidos/activos', async (req, res) => {
    try {
        const query = `
            SELECT 
                v.id_venta,
                v.fecha,
                v.total,
                v.tipo_entrega,
                v.estado,
                f.nombre AS cliente_nombre, -- Traemos el nombre desde la tabla facturas
                v.medio_pago,               -- El nuevo campo de la tabla ventas
                STRING_AGG(p.nombre || ' x' || dv.cantidad, ', ') AS resumen_productos
            FROM ventas v
            LEFT JOIN detalles_ventas dv ON v.id_venta = dv.id_venta
            LEFT JOIN productos p ON dv.id_producto = p.id_producto
            LEFT JOIN facturas f ON v.id_venta = f.id_venta -- Relacionamos la factura con la venta
            WHERE v.estado NOT IN ('Completado', 'Cancelado', 'Entregado')
            GROUP BY v.id_venta, f.nombre -- Hay que agrupar también por el nombre del cliente
            ORDER BY v.fecha DESC;
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error al obtener pedidos activos:', error);
        res.status(500).json({ error: 'Error al obtener los pedidos activos' });
    }
});
*/

//endpoint para obtener pedidos completados hoy
/*app.get('/pedidos/completados-hoy', async (req, res) => {
    try {
        const query = `
            SELECT COUNT(*) AS cantidad 
            FROM ventas 
            WHERE estado = 'Completado' 
              AND DATE(fecha) = CURRENT_DATE;
        `;
        const result = await pool.query(query);
        // Devuelve solo el número
        res.json({ completados: parseInt(result.rows[0].cantidad) });
    } catch (error) {
        console.error('❌ Error al obtener métricas de hoy:', error);
        res.status(500).json({ error: 'Error al calcular completados' });
    }
});
*/



//endpoint para la funcion de la pantalla de pedidos de la aplicacion de cobrar y enviar a la cocina
app.post('/pedidos', async (req, res) => {
    const { cliente_nombre, tipo_entrega, medio_pago, total, id_usuario, productos } = req.body;
    
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Iniciamos la transacción

        // 1. Insertar la Venta principal (incluyendo el medio_pago)
        const insertVentaQuery = `
            INSERT INTO ventas (fecha, total, tipo_entrega, estado, id_usuario, medio_pago) 
            VALUES (NOW(), $1, $2, 'Pedido tomado', $3, $4) 
            RETURNING id_venta;
        `;
        const ventaResult = await client.query(insertVentaQuery, [total, tipo_entrega, id_usuario, medio_pago]);
        const nuevaVentaId = ventaResult.rows[0].id_venta;

        // 2. Insertar en Facturas para guardar el nombre del cliente
        // Dejamos 'tipo' en un valor por defecto como 'X' (ticket) y 'cuit' en null temporalmente
        const insertFacturaQuery = `
            INSERT INTO facturas (tipo, cuit, nombre, id_venta)
            VALUES ('X', NULL, $1, $2);
        `;
        await client.query(insertFacturaQuery, [cliente_nombre, nuevaVentaId]);

        // 3. Insertar cada producto en detalles_ventas
        const insertDetalleQuery = `
            INSERT INTO detalles_ventas (id_venta, id_producto, cantidad, precio_unitario, subtotal)
            VALUES ($1, $2, $3, $4, $5);
        `;
        
        for (const item of productos) {
            await client.query(insertDetalleQuery, [
                nuevaVentaId, 
                item.id_producto, 
                item.cantidad, 
                item.precio_unitario, 
                item.subtotal
            ]);
        }

        await client.query('COMMIT'); // Confirmamos los cambios

        res.status(201).json({ 
            mensaje: 'Pedido creado exitosamente', 
            id_venta: nuevaVentaId 
        });

    } catch (error) {
        await client.query('ROLLBACK'); // Si algo falla, deshacemos todo
        console.error('❌ Error al crear el pedido:', error);
        res.status(500).json({ error: 'Error al procesar el pedido' });
    } finally {
        client.release(); // Liberamos la conexión
    }
});




//funcion para marcar como entregado y marcar los demas estados de los pedidos
/*app.patch('/pedidos/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; // ej: "Completado", "En preparación", "Listo"

    try {
        const query = `
            UPDATE ventas 
            SET estado = $1 
            WHERE id_venta = $2 
            RETURNING id_venta, estado;
        `;
        const result = await pool.query(query, [estado, id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        res.json({ 
            mensaje: 'Estado actualizado', 
            pedido: result.rows[0] 
        });

    } catch (error) {
        console.error('❌ Error al actualizar estado:', error);
        res.status(500).json({ error: 'Error al cambiar el estado del pedido' });
    }
});
*/



app.listen(PORT, () => {
    console.log(`🟢 Servidor corriendo en puerto ${PORT}`);
});
