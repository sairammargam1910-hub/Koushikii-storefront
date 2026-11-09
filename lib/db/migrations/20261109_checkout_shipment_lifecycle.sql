ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'pickup_scheduled';
ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'picked_up';
ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'in_transit';
ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'booking_failed';
ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE checkout_shipment_status ADD VALUE IF NOT EXISTS 'returned';
