const db = require('../config/db');

function createReservation(reservation, callback) {
    const sql = `INSERT INTO reservations
                 (product_id, buyer_id, seller_id, appointment_date, appointment_time, meeting_location, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending')`;
    const params = [
        reservation.productId,
        reservation.buyerId,
        reservation.sellerId,
        reservation.appointmentDate,
        reservation.appointmentTime,
        reservation.meetingLocation
    ];
    db.query(sql, params, callback);
}

function findActiveReservation(productId, buyerId, callback) {
    const sql = `SELECT id
                 FROM reservations
                 WHERE product_id = ?
                   AND buyer_id = ?
                   AND status IN ('pending', 'proposed', 'confirmed')
                 LIMIT 1`;
    db.query(sql, [productId, buyerId], callback);
}

function getReservationsForUser(userId, callback) {
    const sql = `SELECT reservations.*,
                        products.name AS product_name,
                        products.image AS product_image,
                        products.price AS product_price,
                        buyers.name AS buyer_name,
                        sellers.name AS seller_name,
                        CASE WHEN reservations.buyer_id = ? THEN 'buyer' ELSE 'seller' END AS user_role
                 FROM reservations
                 JOIN products ON reservations.product_id = products.id
                 JOIN users AS buyers ON reservations.buyer_id = buyers.id
                 JOIN users AS sellers ON reservations.seller_id = sellers.id
                 WHERE reservations.buyer_id = ? OR reservations.seller_id = ?
                 ORDER BY reservations.created_at DESC`;
    db.query(sql, [userId, userId, userId], callback);
}

function getReservationById(reservationId, callback) {
    const sql = `SELECT reservations.*,
                        products.name AS product_name,
                        products.image AS product_image,
                        products.price AS product_price,
                        products.status AS product_status,
                        buyers.name AS buyer_name,
                        sellers.name AS seller_name
                 FROM reservations
                 JOIN products ON reservations.product_id = products.id
                 JOIN users AS buyers ON reservations.buyer_id = buyers.id
                 JOIN users AS sellers ON reservations.seller_id = sellers.id
                 WHERE reservations.id = ?`;
    db.query(sql, [reservationId], callback);
}

function updateBuyerProposal(reservationId, buyerId, appointment, callback) {
    const sql = `UPDATE reservations
                 SET appointment_date = ?, appointment_time = ?, meeting_location = ?, status = 'pending'
                 WHERE id = ?
                   AND buyer_id = ?
                   AND status IN ('pending', 'proposed')`;
    const params = [
        appointment.appointmentDate,
        appointment.appointmentTime,
        appointment.meetingLocation,
        reservationId,
        buyerId
    ];
    db.query(sql, params, callback);
}

function proposeAppointment(reservationId, sellerId, appointment, callback) {
    const sql = `UPDATE reservations
                 SET appointment_date = ?, appointment_time = ?, meeting_location = ?, status = 'proposed'
                 WHERE id = ?
                   AND seller_id = ?
                   AND status IN ('pending', 'proposed')`;
    const params = [
        appointment.appointmentDate,
        appointment.appointmentTime,
        appointment.meetingLocation,
        reservationId,
        sellerId
    ];
    db.query(sql, params, callback);
}

function confirmReservation(reservationId, sellerId, callback) {
    setConfirmedStatus(reservationId, 'seller_id', sellerId, 'pending', callback);
}

function acceptProposal(reservationId, buyerId, callback) {
    setConfirmedStatus(reservationId, 'buyer_id', buyerId, 'proposed', callback);
}

function setConfirmedStatus(reservationId, ownerColumn, ownerId, requiredStatus, callback) {
    db.beginTransaction((transactionError) => {
        if (transactionError) {
            return callback(transactionError);
        }

        const selectSql = `SELECT reservations.product_id, products.status AS product_status
                           FROM reservations
                           JOIN products ON reservations.product_id = products.id
                           WHERE reservations.id = ?
                             AND reservations.${ownerColumn} = ?
                             AND reservations.status = ?
                           FOR UPDATE`;

        db.query(selectSql, [reservationId, ownerId, requiredStatus], (selectError, rows) => {
            if (selectError) {
                return db.rollback(() => callback(selectError));
            }
            if (rows.length === 0 || rows[0].product_status !== 'selling') {
                const error = new Error('The reservation cannot be confirmed in its current state.');
                error.code = 'INVALID_RESERVATION_STATE';
                return db.rollback(() => callback(error));
            }

            const productId = rows[0].product_id;
            db.query("UPDATE reservations SET status = 'confirmed' WHERE id = ?", [reservationId], (updateError) => {
                if (updateError) {
                    return db.rollback(() => callback(updateError));
                }

                const cancelOthersSql = `UPDATE reservations
                                         SET status = 'cancelled'
                                         WHERE product_id = ?
                                           AND id <> ?
                                           AND status IN ('pending', 'proposed')`;
                db.query(cancelOthersSql, [productId, reservationId], (cancelError) => {
                    if (cancelError) {
                        return db.rollback(() => callback(cancelError));
                    }

                    db.query("UPDATE products SET status = 'reserved' WHERE id = ?", [productId], (productError) => {
                        if (productError) {
                            return db.rollback(() => callback(productError));
                        }
                        db.commit((commitError) => {
                            if (commitError) {
                                return db.rollback(() => callback(commitError));
                            }
                            callback(null);
                        });
                    });
                });
            });
        });
    });
}

function cancelReservation(reservationId, userId, callback) {
    db.beginTransaction((transactionError) => {
        if (transactionError) {
            return callback(transactionError);
        }

        const selectSql = `SELECT product_id, status
                           FROM reservations
                           WHERE id = ?
                             AND (buyer_id = ? OR seller_id = ?)
                             AND status IN ('pending', 'proposed', 'confirmed')
                           FOR UPDATE`;
        db.query(selectSql, [reservationId, userId, userId], (selectError, rows) => {
            if (selectError) {
                return db.rollback(() => callback(selectError));
            }
            if (rows.length === 0) {
                const error = new Error('The reservation cannot be cancelled.');
                error.code = 'INVALID_RESERVATION_STATE';
                return db.rollback(() => callback(error));
            }

            db.query("UPDATE reservations SET status = 'cancelled' WHERE id = ?", [reservationId], (updateError) => {
                if (updateError) {
                    return db.rollback(() => callback(updateError));
                }

                if (rows[0].status !== 'confirmed') {
                    return db.commit((commitError) => callback(commitError || null));
                }

                db.query("UPDATE products SET status = 'selling' WHERE id = ?", [rows[0].product_id], (productError) => {
                    if (productError) {
                        return db.rollback(() => callback(productError));
                    }
                    db.commit((commitError) => callback(commitError || null));
                });
            });
        });
    });
}

function deleteReservation(reservationId, buyerId, callback) {
    const sql = `DELETE FROM reservations
                 WHERE id = ?
                   AND buyer_id = ?
                   AND status IN ('pending', 'cancelled')`;
    db.query(sql, [reservationId, buyerId], callback);
}

function completeReservation(reservationId, sellerId, callback) {
    db.beginTransaction((transactionError) => {
        if (transactionError) {
            return callback(transactionError);
        }

        const selectSql = `SELECT reservations.product_id,
                                  reservations.buyer_id,
                                  reservations.seller_id,
                                  products.price,
                                  products.quantity
                           FROM reservations
                           JOIN products ON reservations.product_id = products.id
                           WHERE reservations.id = ?
                             AND reservations.seller_id = ?
                             AND reservations.status = 'confirmed'
                           FOR UPDATE`;

        db.query(selectSql, [reservationId, sellerId], (selectError, rows) => {
            if (selectError) {
                return db.rollback(() => callback(selectError));
            }
            if (rows.length === 0) {
                const error = new Error('Only a confirmed reservation can be completed.');
                error.code = 'INVALID_RESERVATION_STATE';
                return db.rollback(() => callback(error));
            }

            const reservation = rows[0];
            const purchaseSql = `INSERT INTO purchases
                                 (product_id, buyer_id, seller_id, reservation_id, price)
                                 VALUES (?, ?, ?, ?, ?)`;
            const purchaseParams = [
                reservation.product_id,
                reservation.buyer_id,
                reservation.seller_id,
                reservationId,
                reservation.price
            ];

            db.query(purchaseSql, purchaseParams, (purchaseError) => {
                if (purchaseError) {
                    return db.rollback(() => callback(purchaseError));
                }

                db.query("UPDATE reservations SET status = 'completed' WHERE id = ?", [reservationId], (updateError) => {
                    if (updateError) {
                        return db.rollback(() => callback(updateError));
                    }

                    const remainingQuantity = Math.max(Number(reservation.quantity) - 1, 0);
                    const productStatus = remainingQuantity === 0 ? 'sold_out' : 'selling';
                    const productSql = 'UPDATE products SET quantity = ?, status = ? WHERE id = ?';
                    db.query(productSql, [remainingQuantity, productStatus, reservation.product_id], (productError) => {
                        if (productError) {
                            return db.rollback(() => callback(productError));
                        }
                        db.commit((commitError) => {
                            if (commitError) {
                                return db.rollback(() => callback(commitError));
                            }
                            callback(null);
                        });
                    });
                });
            });
        });
    });
}

module.exports = {
    createReservation,
    findActiveReservation,
    getReservationsForUser,
    getReservationById,
    updateBuyerProposal,
    proposeAppointment,
    confirmReservation,
    acceptProposal,
    cancelReservation,
    deleteReservation,
    completeReservation
};
