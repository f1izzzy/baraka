function mapStore(row) {
  return {
    _id: row.id,
    name: row.name,
    description: row.description,
    location: row.location,
    address: row.address,
    coverImage: row.cover_image,
    logo: row.logo,
    createdAt: row.created_at,
  };
}

function mapProduct(row) {
  return {
    _id: row.id,
    storeId: row.store_id,
    title: row.title,
    description: row.description,
    category: row.category,
    price: Number(row.price),
    oldPrice: Number(row.old_price),
    image: row.image,
    sizes: row.sizes || [],
    remainingQuantity: row.remaining_quantity,
    views: row.views,
    expirationDate: row.expiration_date,
    createdAt: row.created_at,
  };
}

function mapUser(row) {
  return {
    _id: row.id,
    telegramId: row.telegram_id,
    firstName: row.first_name,
    username: row.username,
    createdAt: row.created_at,
  };
}

module.exports = {
  mapStore,
  mapProduct,
  mapUser,
};
