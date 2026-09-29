-- Sample data for local runs and screenshots (never run by the Chest). The
-- member ids are those of the studio's dev harness (lab/chest-dev/cast.mjs):
-- camille (manager), ines, hugo, lea, tom, sofia (members).
do $$
declare
  camille text := 'mbr_camilleaaaaaaaaaaaaaaaaaaa';
  ines text := 'mbr_inesaaaaaaaaaaaaaaaaaaaaaa';
  hugo text := 'mbr_hugoaaaaaaaaaaaaaaaaaaaaaa';
  lea text := 'mbr_leaaaaaaaaaaaaaaaaaaaaaaaa';
  tom text := 'mbr_tomaaaaaaaaaaaaaaaaaaaaaaa';
  sofia text := 'mbr_sofiaaaaaaaaaaaaaaaaaaaaaa';
  b1 bigint; b2 bigint; b3 bigint;
  c_todo bigint; c_doing bigint; c_done bigint; c_ideas bigint; c_review bigint; c_move bigint;
  k bigint; k2 bigint;
  f_budget bigint; f_priority bigint;
  l_urgent bigint; l_client bigint; l_design bigint; l_dev bigint;
begin
  -- Office move: the team's shared board.
  insert into boards (name, color, visibility, created_by) values ('Office move', 'sun', 'team', camille) returning id into b1;
  insert into board_people (board_id, member_id, owner) values (b1, camille, true);
  insert into columns (board_id, name, position) values (b1, 'To do', 'i') returning id into c_todo;
  c_move := c_todo;
  insert into columns (board_id, name, position) values (b1, 'Doing', 'r') returning id into c_doing;
  insert into columns (board_id, name, position, done) values (b1, 'Done', 'v', true) returning id into c_done;
  insert into labels (board_id, name, color) values (b1, 'Urgent', 'tomato') returning id into l_urgent;
  insert into labels (board_id, name, color) values (b1, 'Suppliers', 'sky') returning id into l_client;
  insert into fields (board_id, name, kind, options, position) values (b1, 'Budget (€)', 'number', '[]', 'i') returning id into f_budget;
  insert into fields (board_id, name, kind, options, position) values (b1, 'Priority', 'choice', '["High", "Medium", "Low"]', 'r') returning id into f_priority;

  insert into cards (board_id, column_id, title, description, position, due_on, due_time, start_on, created_by, created_at) values (b1, c_todo, 'Book the moving truck for the 14th', E'Two quotes received:\n- **Déménageurs Lyonnais**: 1,620 €\n- **MoveUp**: 1,450 €\n\nAsk for *insurance included*. Their site: https://example.com/moveup', 'i', current_date - 1, '15:00', current_date - 5, camille, now() - interval '6 days') returning id into k;
  insert into card_assignees values (k, hugo); insert into card_labels values (k, l_urgent), (k, l_client);
  insert into card_values values (k, f_budget, '1450'), (k, f_priority, 'High');
  insert into checklist_items (card_id, text, done, position, assignee, due_on) values (k, 'Ask both for insurance', true, 'i', null, null), (k, 'Confirm the date with the building manager', false, 'r', ines, current_date + 1);
  insert into checklists (card_id, title, position) values (k, 'On moving day', 'i') returning id into k2;
  insert into checklist_items (card_id, text, done, position, checklist_id) values (k, 'Reserve the lift', false, 'v', k2), (k, 'Parking permit for the truck', false, 'x', k2);
  insert into comments (card_id, author, body, created_at) values (k, ines, 'MoveUp answered: 1,450 € with insurance.', now() - interval '3 hours');
  insert into activity (card_id, actor, kind, at) values (k, camille, 'created', now() - interval '6 days');

  insert into cards (board_id, column_id, title, position, due_on, created_by, created_at) values (b1, c_todo, 'Order 40 archive boxes', 'r', current_date, camille, now() - interval '4 days') returning id into k;
  insert into card_assignees values (k, ines);
  insert into card_values values (k, f_budget, '120'), (k, f_priority, 'Medium');
  insert into checklist_items (card_id, text, done, position) values (k, 'Compare prices', true, 'i'), (k, 'Order', false, 'r');
  insert into activity (card_id, actor, kind, at) values (k, camille, 'created', now() - interval '4 days');

  insert into cards (board_id, column_id, title, position, due_on, created_by, created_at) values (b1, c_todo, 'Tell our clients about the new address', 'v', current_date + 4, camille, now() - interval '4 days') returning id into k;
  insert into card_assignees values (k, sofia), (k, ines); insert into card_labels values (k, l_client);
  insert into card_values values (k, f_priority, 'Medium');
  insert into activity (card_id, actor, kind, at) values (k, camille, 'created', now() - interval '4 days');

  insert into cards (board_id, column_id, title, position, due_on, created_by, created_at) values (b1, c_todo, 'Plan the housewarming drinks', 'x', current_date + 12, camille, now() - interval '2 days') returning id into k;
  insert into card_values values (k, f_budget, '300'), (k, f_priority, 'Low');
  insert into activity (card_id, actor, kind, at) values (k, camille, 'created', now() - interval '2 days');

  insert into cards (board_id, column_id, title, description, position, due_on, start_on, created_by, created_at) values (b1, c_doing, 'Internet and phone line at the new office', 'Technician visit booked. Check the Wi-Fi covers the meeting room.', 'i', current_date + 2, current_date - 3, tom, now() - interval '5 days') returning id into k;
  insert into card_assignees values (k, tom);
  insert into card_values values (k, f_budget, '89'), (k, f_priority, 'High');
  insert into checklist_items (card_id, text, done, position, assignee, due_on) values (k, 'Sign the contract', true, 'i', null, null), (k, 'Technician visit', false, 'r', tom, current_date + 2), (k, 'Test the Wi-Fi', false, 'v', hugo, current_date + 3);
  insert into activity (card_id, actor, kind, at) values (k, tom, 'created', now() - interval '5 days');

  insert into cards (board_id, column_id, title, position, due_on, created_by, created_at) values (b1, c_doing, 'Floor plan: who sits where', 'r', current_date + 6, camille, now() - interval '3 days') returning id into k;
  insert into card_assignees values (k, camille);
  insert into comments (card_id, author, body, created_at) values (k, lea, 'Can the tech team be next to the window? @Camille Martin', now() - interval '1 day');
  insert into activity (card_id, actor, kind, at) values (k, camille, 'created', now() - interval '3 days');

  insert into cards (board_id, column_id, title, position, created_by, completed_at) values (b1, c_done, 'Sign the new lease', 'i', camille, now() - interval '9 days') returning id into k;
  insert into card_assignees values (k, camille);
  insert into cards (board_id, column_id, title, position, created_by, completed_at) values (b1, c_done, 'Choose the new office', 'r', camille, now() - interval '30 days');

  -- Website redesign: a project board.
  insert into boards (name, color, visibility, created_by) values ('Website redesign', 'grape', 'team', lea) returning id into b2;
  insert into board_people (board_id, member_id, owner) values (b2, lea, true);
  insert into columns (board_id, name, position) values (b2, 'Ideas', 'i') returning id into c_ideas;
  insert into columns (board_id, name, position) values (b2, 'To do', 'r') returning id into c_todo;
  insert into columns (board_id, name, position) values (b2, 'Doing', 'v') returning id into c_doing;
  insert into columns (board_id, name, position) values (b2, 'To check', 'x') returning id into c_review;
  insert into columns (board_id, name, position, done) values (b2, 'Done', 'z', true) returning id into c_done;
  insert into labels (board_id, name, color) values (b2, 'Design', 'berry') returning id into l_design;
  insert into labels (board_id, name, color) values (b2, 'Development', 'sea') returning id into l_dev;
  insert into cards (board_id, column_id, title, position, created_by) values (b2, c_ideas, 'A page per service, with prices', 'i', sofia) returning id into k;
  insert into cards (board_id, column_id, title, position, due_on, created_by) values (b2, c_todo, 'Write the "About us" text', 'i', current_date + 10, lea) returning id into k;
  insert into card_assignees values (k, sofia);
  insert into cards (board_id, column_id, title, position, due_on, created_by) values (b2, c_doing, 'Homepage mockup', 'i', current_date + 3, lea) returning id into k;
  insert into card_assignees values (k, lea); insert into card_labels values (k, l_design);
  insert into cards (board_id, column_id, title, position, due_on, created_by) values (b2, c_review, 'Contact form sends to Support', 'i', current_date + 1, tom) returning id into k;
  insert into card_assignees values (k, tom), (k, hugo); insert into card_labels values (k, l_dev);
  insert into cards (board_id, column_id, title, position, created_by, completed_at) values (b2, c_done, 'Pick the fonts', 'i', lea, now() - interval '5 days') returning id into k;
  insert into card_labels values (k, l_design);

  -- Léa's arrival: a private onboarding board.
  insert into boards (name, color, visibility, created_by) values ('Arrival of Nora', 'leaf', 'private', camille) returning id into b3;
  insert into board_people (board_id, member_id, owner) values (b3, camille, true), (b3, tom, false);
  insert into columns (board_id, name, position) values (b3, 'Before day one', 'i') returning id into c_todo;
  insert into columns (board_id, name, position) values (b3, 'Day one', 'r') returning id into c_doing;
  insert into columns (board_id, name, position) values (b3, 'First week', 'v') returning id into c_review;
  insert into columns (board_id, name, position, done) values (b3, 'Done', 'x', true) returning id into c_done;
  insert into cards (board_id, column_id, title, position, due_on, created_by) values (b3, c_todo, 'Prepare her laptop', 'i', current_date + 5, camille) returning id into k;
  insert into card_assignees values (k, tom);
  insert into cards (board_id, column_id, title, position, created_by) values (b3, c_doing, 'Welcome breakfast', 'i', camille);
  insert into cards (board_id, column_id, title, position, created_by) values (b3, c_review, 'Lunch with the sales team', 'i', camille);

  -- A repeating card (card 17): every Monday and Thursday, on the office move board.
  insert into cards (board_id, column_id, title, description, position, due_on, created_by, repeat) values (b1, c_move, 'Water the plants', 'The big ones by the window need a full can.', 'y', current_date, ines, '{"every": "week", "days": [1, 4]}') returning id into k;
  insert into card_assignees values (k, ines);
  insert into checklist_items (card_id, text, done, position) values (k, 'Big plants by the window', false, 'i'), (k, 'Reception desk', false, 'r');
  insert into activity (card_id, actor, kind) values (k, ines, 'created'), (k, ines, 'repeat_set');
end $$;
