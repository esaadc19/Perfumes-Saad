-- Numero de WhatsApp de la tienda.
--
-- Es el unico numero al que apuntan los enlaces de la tienda: el boton del
-- hero y el recibo que el cliente envia. El resto de enlaces `wa.me` del
-- proyecto (cobranza, pedidos, CRM, reportes) usan el telefono del cliente
-- y no se tocan.
--
-- Se actualiza el valor guardado, no el codigo, para que el admin lo pueda
-- cambiar despues desde Configuracion como cualquier otro dato.

update store_settings
set whatsapp_number = '573102318786',
    updated_at = now()
where id = 1;

-- Si la tabla todavia no tiene fila, se crea con el numero nuevo para que
-- una base recien creada no quede apuntando al numero anterior.
insert into store_settings (id, whatsapp_number)
select 1, '573102318786'
where not exists (select 1 from store_settings where id = 1);