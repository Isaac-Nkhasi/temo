export const images = {
  farmer: "https://images.unsplash.com/photo-1582915331879-5a87d7abf87c?auto=format&fit=crop&w=900&q=85",
  market: "https://images.unsplash.com/photo-1572851569977-e18b9ea6edbe?auto=format&fit=crop&w=700&q=85",
};
export const productImage = (url: string | null | undefined) => url || images.market;
