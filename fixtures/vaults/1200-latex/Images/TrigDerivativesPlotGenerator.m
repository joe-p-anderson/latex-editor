% Define the domain from -pi to 3*pi
x = linspace(-pi, 3*pi, 1000);

% Define x-tick values and TeX formatted labels
x_ticks = -pi : pi/2 : 3*pi;
x_labels = {'-\pi', '-\pi/2', '0', '\pi/2', '\pi', '3\pi/2', '2\pi', '5\pi/2', '3\pi'};

% Functions and plot metadata
y_data = {sin(x), cos(x), -sin(x), -cos(x)};
func_titles = {'$y = \sin(x)$', '$y = \cos(x)$', '$y = -\sin(x)$', '$y = -\cos(x)$'};
line_colors = {'#0072BD', '#D95319', '#EDB120', '#7E2F8E'};

% Create figure window
figure('Color', 'w', 'Name', 'Trigonometric Functions');

% Create a 4x1 tiled layout with compact spacing for shared x-axis feel
t = tiledlayout(4, 1, 'TileSpacing', 'compact', 'Padding', 'compact');

ax_handles = gobjects(1, 4);

for i = 1:4
    ax_handles(i) = nexttile(t);
    plot(x, y_data{i}, 'LineWidth', 1.5, 'Color', 'k');
    
    % Customize axes and align to origin
    ax = gca;
    ax.XAxisLocation = 'origin';
    ax.YAxisLocation = 'origin';
    ax.TickLabelInterpreter = 'tex';
    
    % Apply pi-formatted ticks
    xticks(x_ticks);
    xticklabels(x_labels);
    
    % Set limits
    xlim([-pi, 3*pi]);
    ylim([-1.25, 1.25]);
    
    % Grid settings
    grid on;
    ax.GridAlpha = 0.3;
    ax.MinorGridAlpha = 0.1;
    grid minor;
    pbaspect([5,1,1])
    
    % Add subplot title
    title(func_titles{i}, 'Interpreter', 'latex', 'FontSize', 11);
end

% Link x-axes across all subplots for synchronized zooming/panning
linkaxes(ax_handles, 'x');