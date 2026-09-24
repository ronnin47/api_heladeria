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
const server = http.createServer(app);

app.use(cors());

app.use(express.json({ limit: '50mb' })); // para parsear JSON
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


//****************** */ Configuración de Socket.IO ********************
const { Server } = require('socket.io');

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});
//**************************************************** 
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






//eventos de io
io.on('connection', (socket) => {
    console.log('🟢 Cliente conectado:', socket.id);

    socket.on('disconnect', () => {
        console.log('🔴 Cliente desconectado:', socket.id);
    });
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


//.............DEV_JORGE.............
//Endpoint 
app.get('/usuarios', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM usuarios');

          console.log('===== USUARIOS OBTENIDOS =====');
        console.log(result.rows);
        console.log('==============================');

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

        console.log('==========================');
        console.log('USUARIO OBTENIDO DE LA BASE:');
        console.log(usuario);
        console.log('ID USUARIO:', usuario.id);
        console.log('==========================');

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


//endpoint para la funcion de la pantalla de pedidos de la aplicacion de cobrar y enviar a la cocina
/*
app.post('/insertPedido', async (req, res) => {

    const {
        cliente_nombre,
        tipo_entrega,
        direccion,
        telefono,
        medio_pago,
        total,
        id,
        productos
    } = req.body;

    //estamos agregando telefono en este endpoint

    console.log("===== DATOS DEL PEDIDO =====");
    console.log("cliente_nombre:", cliente_nombre);
    console.log("tipo_entrega:", tipo_entrega);
    console.log("direccion:", direccion);
    console.log("telefono:", telefono);
    console.log("medio_pago:", medio_pago);
    console.log("total:", total);
    console.log("id_usuario:", id);
    console.log("productos:", productos);
    console.log("============================");


    const client = await pool.connect();

    try {

        await client.query('BEGIN');


        // 1. Crear la venta/pedido
        const insertVentaQuery = `
            INSERT INTO ventas
            (
                fecha,
                total,
                tipo_entrega,
                estado,
                id_usuario,
                medio_pago
            )
            VALUES
            (
                NOW(),
                $1,
                $2,
                'Pedido tomado',
                $3,
                $4
            )
            RETURNING id_venta;
        `;


        const ventaResult = await client.query(
            insertVentaQuery,
            [
                total,
                tipo_entrega,
                id,
                medio_pago
            ]
        );


        const nuevaVentaId =
            ventaResult.rows[0].id_venta;


        // 2. Guardar el nombre del cliente
        const insertFacturaQuery = `
            INSERT INTO facturas
            (
                tipo,
                cuit,
                nombre,
                id_venta
            )
            VALUES
            (
                'X',
                NULL,
                $1,
                $2
            );
        `;


        await client.query(
            insertFacturaQuery,
            [
                cliente_nombre,
                nuevaVentaId
            ]
        );


        // 3. Guardar los productos del pedido
        const insertDetalleQuery = `
            INSERT INTO detalles_ventas
            (
                id_venta,
                id_producto,
                id_vc,
                cantidad,
                precio_unitario,
                subtotal
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6
            )
            RETURNING id_detalle;
        `;


        for (const item of productos) {

            const detalleResult = await client.query(
                insertDetalleQuery,
                [
                    nuevaVentaId,
                    item.id_producto,
                    item.id_vc || null,
                    item.cantidad,
                    item.precio_unitario,
                    item.subtotal
                ]
            );


            const nuevoDetalleId =
                detalleResult.rows[0].id_detalle;


            // 4. Guardar los sabores del producto
            if (
                item.sabores &&
                item.sabores.length > 0
            ) {

                const insertSaborQuery = `
                    INSERT INTO detalles_ventas_sabores
                    (
                        id_detalle,
                        id_sabor
                    )
                    VALUES
                    (
                        $1,
                        $2
                    );
                `;


                for (const idSabor of item.sabores) {

                    await client.query(
                        insertSaborQuery,
                        [
                            nuevoDetalleId,
                            idSabor
                        ]
                    );
                }
            }
        }


        // 5. Si es Delivery, crear la entrega
        if (tipo_entrega === 'Delivery') {

            const insertEntregaQuery = `
                INSERT INTO entregas
                (
                    id_venta,
                    direccion,
                    estado,
                    fecha_entrega,
                    id_repartidor
                )
                VALUES
                (
                    $1,
                    $2,
                    'Pendiente',
                    NULL,
                    NULL
                );
            `;


            await client.query(
                insertEntregaQuery,
                [
                    nuevaVentaId,
                    direccion
                ]
            );
        }


        // 6. Confirmar todas las operaciones
        await client.query('COMMIT');


        res.status(201).json({
            mensaje: 'Pedido creado exitosamente',
            id_venta: nuevaVentaId
        });


    } catch (error) {

        await client.query('ROLLBACK');

        console.error(
            '❌ Error al crear el pedido:',
            error
        );

        res.status(500).json({
            error: 'Error al procesar el pedido'
        });

    } finally {

        client.release();

    }
});
*/

//

app.post('/insertPedido', async (req, res) => {

    const {
        cliente_nombre,
        tipo_entrega,
        direccion,
        telefono,
        medio_pago,
        total,
        id,
        productos
    } = req.body;

    // Si telefono no viene, queda en null
    const telefonoPedido =
        telefono !== undefined &&
        telefono !== null &&
        telefono !== ''
            ? telefono
            : null;

    console.log("===== DATOS DEL PEDIDO =====");
    console.log("cliente_nombre:", cliente_nombre);
    console.log("tipo_entrega:", tipo_entrega);
    console.log("direccion:", direccion);
    console.log("telefono:", telefonoPedido);
    console.log("medio_pago:", medio_pago);
    console.log("total:", total);
    console.log("id_usuario:", id);
    console.log("productos:", productos);
    console.log("============================");


    const client = await pool.connect();

    try {

        await client.query('BEGIN');


        // 1. Crear la venta/pedido
        const insertVentaQuery = `
            INSERT INTO ventas
            (
                fecha,
                total,
                tipo_entrega,
                estado,
                id_usuario,
                medio_pago
            )
            VALUES
            (
                NOW(),
                $1,
                $2,
                'Pedido tomado',
                $3,
                $4
            )
            RETURNING id_venta;
        `;


        //

        const ventaResult = await client.query(
            insertVentaQuery,
            [
                total,
                tipo_entrega,
                id,
                medio_pago
            ]
        );


        const nuevaVentaId =
            ventaResult.rows[0].id_venta;


        // 2. Guardar el nombre del cliente
        const insertFacturaQuery = `
            INSERT INTO facturas
            (
                tipo,
                cuit,
                nombre,
                id_venta
            )
            VALUES
            (
                'X',
                NULL,
                $1,
                $2
            );
        `;


        await client.query(
            insertFacturaQuery,
            [
                cliente_nombre,
                nuevaVentaId
            ]
        );


        // 3. Guardar los productos del pedido
        const insertDetalleQuery = `
            INSERT INTO detalles_ventas
            (
                id_venta,
                id_producto,
                id_vc,
                cantidad,
                precio_unitario,
                subtotal
            )
            VALUES
            (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6
            )
            RETURNING id_detalle;
        `;


        for (const item of productos) {

            const detalleResult = await client.query(
                insertDetalleQuery,
                [
                    nuevaVentaId,
                    item.id_producto,
                    item.id_vc || null,
                    item.cantidad,
                    item.precio_unitario,
                    item.subtotal
                ]
            );


            const nuevoDetalleId =
                detalleResult.rows[0].id_detalle;


            // 4. Guardar los sabores del producto
            if (
                item.sabores &&
                item.sabores.length > 0
            ) {

                const insertSaborQuery = `
                    INSERT INTO detalles_ventas_sabores
                    (
                        id_detalle,
                        id_sabor
                    )
                    VALUES
                    (
                        $1,
                        $2
                    );
                `;


                for (const idSabor of item.sabores) {

                    await client.query(
                        insertSaborQuery,
                        [
                            nuevoDetalleId,
                            idSabor
                        ]
                    );
                }
            }
        }


        // 5. Si es Delivery, crear la entrega
        if (tipo_entrega === 'Delivery') {

            const insertEntregaQuery = `
                INSERT INTO entregas
                (
                    id_venta,
                    direccion,
                    telefono,
                    estado,
                    fecha_entrega,
                    id_repartidor
                )
                VALUES
                (
                    $1,
                    $2,
                    $3,
                    'Pendiente',
                    NULL,
                    NULL
                );
            `;


            await client.query(
                insertEntregaQuery,
                [
                    nuevaVentaId,
                    direccion,
                    telefonoPedido
                ]
            );
        }


        // 6. Confirmar todas las operaciones
        await client.query('COMMIT');



        console.log(
    '📢 SOCKET: pedido_creado disparado. ID venta:',
    nuevaVentaId
);
        // Avisar a todos los clientes que se creó un pedido
io.emit('pedido_creado', {
    id_venta: nuevaVentaId
});

        res.status(201).json({
            mensaje: 'Pedido creado exitosamente',
            id_venta: nuevaVentaId
        });


    } catch (error) {

        await client.query('ROLLBACK');

        console.error(
            '❌ Error al crear el pedido:',
            error
        );

        res.status(500).json({
            error: 'Error al procesar el pedido'
        });

    } finally {

        client.release();

    }
});


// Endpoint para obtener los pedidos activos
app.get('/pedidosActivos', async (req, res) => {

    const client = await pool.connect();

    try {

        const query = `
            SELECT
                v.id_venta,
                v.fecha,
                v.total,
                v.tipo_entrega,
                v.estado,
                v.medio_pago,

                f.nombre AS cliente_nombre,

                e.direccion,
                e.estado AS estado_entrega,

                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'id_detalle', dv.id_detalle,
                            'id_producto', dv.id_producto,
                            'id_vc', dv.id_vc,
                            'cantidad', dv.cantidad,
                            'precio_unitario', dv.precio_unitario,
                            'subtotal', dv.subtotal,
                            'producto_nombre', p.nombre,
                            'producto_tipo', p.tipo,
                            'vc_tipo', vc.tipo,
                            'vc_descripcion', vc.descripcion,
                            'sabores',
                            COALESCE(
                                (
                                    SELECT json_agg(
                                        jsonb_build_object(
                                            'id_sabor', s.id_sabor,
                                            'nombre', s.nombre
                                        )
                                    )
                                    FROM detalles_ventas_sabores dvs
                                    INNER JOIN sabores s
                                        ON s.id_sabor = dvs.id_sabor
                                    WHERE dvs.id_detalle = dv.id_detalle
                                ),
                                '[]'::json
                            )
                        )
                    ) FILTER (WHERE dv.id_detalle IS NOT NULL),
                    '[]'::json
                ) AS productos

            FROM ventas v

            LEFT JOIN facturas f
                ON f.id_venta = v.id_venta

            LEFT JOIN entregas e
                ON e.id_venta = v.id_venta

            LEFT JOIN detalles_ventas dv
                ON dv.id_venta = v.id_venta

            LEFT JOIN productos p
                ON p.id_producto = dv.id_producto

            LEFT JOIN vasitos_cucuruchos vc
                ON vc.id_vc = dv.id_vc

            WHERE v.estado <> 'Entregado'

            GROUP BY
                v.id_venta,
                v.fecha,
                v.total,
                v.tipo_entrega,
                v.estado,
                v.medio_pago,
                f.nombre,
                e.direccion,
                e.estado

            ORDER BY v.id_venta DESC;
        `;

        const resultado = await client.query(query);

        res.status(200).json(resultado.rows);

    } catch (error) {

        console.error(
            '❌ Error al obtener pedidos activos:',
            error
        );

        res.status(500).json({
            error: 'Error al obtener los pedidos activos'
        });

    } finally {
        client.release();
    }
});


//estamsoa haciendo un endpoint para obtener los pedidos completados de hoy, es decir, aquellos que tienen el estado "Entregado" y cuya fecha es la del día actual.
app.get('/pedidosCompletadosHoy', async (req, res) => {

    const client = await pool.connect();

    try {

        const query = `
            SELECT
                v.id_venta,
                v.fecha,
                v.total,
                v.tipo_entrega,
                v.estado,
                v.medio_pago,

                f.nombre AS cliente_nombre,

                e.direccion,
                e.telefono,
                e.estado AS estado_entrega,

                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'id_detalle', dv.id_detalle,
                            'id_producto', dv.id_producto,
                            'id_vc', dv.id_vc,
                            'cantidad', dv.cantidad,
                            'precio_unitario', dv.precio_unitario,
                            'subtotal', dv.subtotal,
                            'producto_nombre', p.nombre,
                            'producto_tipo', p.tipo,
                            'vc_tipo', vc.tipo,
                            'vc_descripcion', vc.descripcion,
                            'sabores',
                            COALESCE(
                                (
                                    SELECT json_agg(
                                        jsonb_build_object(
                                            'id_sabor', s.id_sabor,
                                            'nombre', s.nombre
                                        )
                                    )
                                    FROM detalles_ventas_sabores dvs
                                    INNER JOIN sabores s
                                        ON s.id_sabor = dvs.id_sabor
                                    WHERE dvs.id_detalle = dv.id_detalle
                                ),
                                '[]'::json
                            )
                        )
                    ) FILTER (WHERE dv.id_detalle IS NOT NULL),
                    '[]'::json
                ) AS productos

            FROM ventas v

            LEFT JOIN facturas f
                ON f.id_venta = v.id_venta

            LEFT JOIN entregas e
                ON e.id_venta = v.id_venta

            LEFT JOIN detalles_ventas dv
                ON dv.id_venta = v.id_venta

            LEFT JOIN productos p
                ON p.id_producto = dv.id_producto

            LEFT JOIN vasitos_cucuruchos vc
                ON vc.id_vc = dv.id_vc

            WHERE
                v.estado = 'Entregado'
                AND v.fecha >= CURRENT_DATE
                AND v.fecha < CURRENT_DATE + INTERVAL '1 day'

            GROUP BY
                v.id_venta,
                v.fecha,
                v.total,
                v.tipo_entrega,
                v.estado,
                v.medio_pago,
                f.nombre,
                e.direccion,
                e.telefono,
                e.estado

            ORDER BY v.id_venta DESC;
        `;

        const resultado = await client.query(query);

        res.status(200).json(resultado.rows);

    } catch (error) {

        console.error(
            '❌ Error al obtener pedidos completados de hoy:',
            error
        );

        res.status(500).json({
            error: 'Error al obtener los pedidos completados de hoy'
        });

    } finally {

        client.release();

    }
});

//*********************************************************** */

//-----------DEV_BRIAN----------------
// Obtener pedidos para la pantalla de Producción
app.get('/pedidos/produccion', async (req, res) => {
    try {

        const result = await pool.query(`
            SELECT
                v.id_venta,
                v.fecha,
                v.tipo_entrega,
                v.estado,
                f.nombre AS cliente_nombre,

                dv.id_detalle,
                dv.id_producto,
                p.nombre AS producto_nombre,
                dv.cantidad,

                COALESCE(
                    (
                        SELECT json_agg(s.nombre)
                        FROM detalles_ventas_sabores dvs
                        INNER JOIN sabores s
                            ON s.id_sabor = dvs.id_sabor
                        WHERE dvs.id_detalle = dv.id_detalle
                    ),
                    '[]'::json
                ) AS sabores

            FROM ventas v

            INNER JOIN facturas f
                ON f.id_venta = v.id_venta

            INNER JOIN detalles_ventas dv
                ON dv.id_venta = v.id_venta

            INNER JOIN productos p
                ON p.id_producto = dv.id_producto

            WHERE v.estado IN (
                'Pedido tomado',
                'En preparación',
                'Listo'
            )

            ORDER BY v.fecha ASC;
        `);

        res.json(result.rows);

    } catch (error) {

        console.error(
            '❌ Error al obtener pedidos de producción:',
            error
        );

        res.status(500).json({
            error: 'Error al obtener los pedidos de producción'
        });
    }
});



// UPDATEAR ESTADO EN LA TABLA DE VENTAS
app.put('/updatePedidos/estado', async (req, res) => {
    try {

        const { id_venta, estado } = req.body;

        const result = await pool.query(`
            UPDATE ventas
            SET estado = $1
            WHERE id_venta = $2
            RETURNING id_venta, estado;
        `, [estado, id_venta]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'No se encontró el pedido'
            });
        }

        res.json(result.rows[0]);

    } catch (error) {

        console.error(
            '❌ Error al cambiar estado del pedido:',
            error
        );

        res.status(500).json({
            error: 'Error al cambiar estado del pedido'
        });
    }
});


/*

app.listen(PORT, async () => {
    console.log(`🟢 Servidor corriendo en puerto ${PORT}`);

    try {
        const respuesta = await fetch(`http://localhost:${PORT}/pedidosCompletadosHoy`);
        const datos = await respuesta.json();

        console.log("📦 Pedidos completados hoy:");
        console.log(datos);

    } catch (error) {
        console.error("❌ Error al consultar pedidos completados hoy:", error);
    }
});

*/

// AL FINAL DEL ARCHIVO
server.listen(PORT, () => {
    console.log(`🟢 Servidor corriendo en puerto ${PORT}`);
});