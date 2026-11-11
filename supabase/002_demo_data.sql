-- OPTIONAL demo content. Run AFTER you have registered at least one FARMER account in the app.
-- It attaches the sample listings and posts from the original design to the earliest farmer.
do $$
declare f uuid;
begin
  select id into f from public.profiles where role = 'farmer' order by created_at limit 1;
  if f is null then
    raise exception 'Register a farmer account in the app first, then run this script.';
  end if;

  insert into public.products (seller_id, name, description, category, price, unit, stock, district, image_url) values
   (f, 'Fresh potatoes', 'Freshly harvested red and white potatoes, sorted and packed in 20 kg bags. Grown without synthetic pesticides and ready for collection.', 'Produce', 180, '20 kg bag', 8, 'Maseru',
    'https://images.unsplash.com/photo-1572851569977-e18b9ea6edbe?auto=format&fit=crop&w=700&q=85'),
   (f, 'Green cabbage', 'Crisp, field-grown cabbage harvested this morning. Ideal for households, restaurants and market traders.', 'Produce', 12, 'head', 45, 'Leribe',
    'https://images.unsplash.com/photo-1594282486552-05b4d80fbb9f?auto=format&fit=crop&w=700&q=85'),
   (f, 'Yellow maize', 'Clean, sun-dried yellow maize from this season''s harvest. Packed in sealed 50 kg bags and suitable for milling or feed.', 'Produce', 240, '50 kg bag', 12, 'Berea',
    'https://images.unsplash.com/photo-1710149468014-3d0eb40caaeb?auto=format&fit=crop&w=700&q=85'),
   (f, 'Dairy cow', 'Healthy dairy cow with a calm temperament. Vaccinations are up to date and farm inspection is welcome before purchase.', 'Livestock', 8500, '', 1, 'Mafeteng',
    'https://images.unsplash.com/photo-1592600411240-a699d5307f81?auto=format&fit=crop&w=700&q=85');

  insert into public.posts (author_id, tag, body) values
   (f, 'Crops', 'My maize leaves are turning yellow from the bottom. We had heavy rain last week. What could be the problem?'),
   (f, 'Livestock', 'Tip for the cold nights: keep young lambs in a dry, wind-free shelter and check their bedding before sunset.');
end $$;
