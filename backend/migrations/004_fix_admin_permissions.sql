UPDATE users 
SET role = 'admin', permissions = '{"all": true}'::jsonb 
WHERE lower(email) IN ('santossilvaluizeduardo@gmail.com', 'gutemberggg10@gmail.com');
