-- Durable log of raw Safaricom STK / C2B payloads (see paymentController).
CREATE TABLE IF NOT EXISTS mpesa_callbacks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(16) NOT NULL,
    checkout_request_id VARCHAR(100) NULL,
    raw_body TEXT NOT NULL,
    parsed_summary VARCHAR(512) NULL,
    payment_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mpesa_callbacks_checkout (checkout_request_id),
    INDEX idx_mpesa_callbacks_payment (payment_id),
    INDEX idx_mpesa_callbacks_created (created_at),
    CONSTRAINT fk_mpesa_callbacks_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);
