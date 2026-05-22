-- Bible Quiz (10 questions)
insert into questions (game_type, order_index, content) values
('bible_quiz', 0, '{"question":"Siapa yang membangun bahtera besar untuk selamat dari banjir besar?","options":["Nuh","Musa","Abraham","Daud"],"answer_index":0}'),
('bible_quiz', 1, '{"question":"Di kota mana Yesus dilahirkan?","options":["Nazaret","Yerusalem","Betlehem","Kapernaum"],"answer_index":2}'),
('bible_quiz', 2, '{"question":"Berapa jumlah rasul Yesus yang terdekat?","options":["10","11","12","13"],"answer_index":2}'),
('bible_quiz', 3, '{"question":"Siapa yang menjual Yusuf kepada saudagar Ismael?","options":["Ruben","Saudara-saudaranya","Potifar","Yakub"],"answer_index":1}'),
('bible_quiz', 4, '{"question":"Kitab apa yang ada di tengah Alkitab?","options":["Mazmur","Amsal","Ayub","Pengkhotbah"],"answer_index":0}'),
('bible_quiz', 5, '{"question":"Berapa hari Yesus berpuasa di padang gurun?","options":["20 hari","30 hari","40 hari","50 hari"],"answer_index":2}'),
('bible_quiz', 6, '{"question":"Siapa yang disebut bapa orang beriman?","options":["Musa","Daud","Abraham","Yakub"],"answer_index":2}'),
('bible_quiz', 7, '{"question":"Mukjizat pertama Yesus terjadi di mana?","options":["Betlehem","Kana","Yerusalem","Nazaret"],"answer_index":1}'),
('bible_quiz', 8, '{"question":"Berapa kali sehari Daniel berdoa hingga ia dimasukkan ke gua singa?","options":["Sekali","Dua kali","Tiga kali","Empat kali"],"answer_index":2}'),
('bible_quiz', 9, '{"question":"Surat apa yang paling panjang dalam Perjanjian Baru?","options":["1 Korintus","Roma","Ibrani","Lukas"],"answer_index":1}');

-- Verse Scramble (5 questions, TB translation)
insert into questions (game_type, order_index, content) values
('verse_scramble', 0, '{"reference":"Yohanes 3:16","words":["Karena","begitu","besar","kasih","Allah","akan","dunia","ini"],"correct_order":[0,1,2,3,4,5,6,7]}'),
('verse_scramble', 1, '{"reference":"Filipi 4:13","words":["Segala","perkara","dapat","kutanggung","di","dalam","Dia","yang","memberi","kekuatan","kepadaku"],"correct_order":[0,1,2,3,4,5,6,7,8,9,10]}'),
('verse_scramble', 2, '{"reference":"Mazmur 23:1","words":["TUHAN","adalah","gembalaku","takkan","kekurangan","aku"],"correct_order":[0,1,2,3,4,5]}'),
('verse_scramble', 3, '{"reference":"Amsal 3:5","words":["Percayalah","kepada","TUHAN","dengan","segenap","hatimu"],"correct_order":[0,1,2,3,4,5]}'),
('verse_scramble', 4, '{"reference":"Roma 8:28","words":["Kita","tahu","sekarang","bahwa","Allah","turut","bekerja","dalam","segala","sesuatu"],"correct_order":[0,1,2,3,4,5,6,7,8,9]}');

-- Emoji Story (5 questions)
insert into questions (game_type, order_index, content) values
('emoji_story', 0, '{"emojis":"🌊⛵🌈🕊️","answer":"nuh dan bahtera","hint":"Kejadian 6-9"}'),
('emoji_story', 1, '{"emojis":"🐟🐟🍞🍞🍞👥👥","answer":"mukjizat roti dan ikan","hint":"Yohanes 6"}'),
('emoji_story', 2, '{"emojis":"👶🌟⭐🎁🐑","answer":"kelahiran yesus","hint":"Lukas 2"}'),
('emoji_story', 3, '{"emojis":"🦁😊🙏🌙","answer":"daniel di gua singa","hint":"Daniel 6"}'),
('emoji_story', 4, '{"emojis":"🌊🏃🌊🌊🏃‍♀️🏃‍♂️","answer":"penyeberangan laut merah","hint":"Keluaran 14"}');
